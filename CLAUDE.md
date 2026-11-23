# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Backend for BetterOffMarket, a real-estate marketplace. Sellers list properties, buyers make and counter offers, and an accepted offer produces PDF agreements that both parties' authorized signers e-sign. It is an Express + TypeScript + Mongoose REST API (all routes under `/api/v1`) with a Socket.IO chat server. The `praying-backend` name in `package.json` is left over from a template.

## Commands

| Task | Command | Notes |
|---|---|---|
| Dev server | `npm run dev` | ts-node-dev with `--transpile-only`, so type errors do **not** stop it |
| Type-check | `npx tsc --noEmit` | Currently fails on one existing error (`$expr` in `src/app/utils/defaultTask.ts`) |
| Build | `npm run build` | `tsc` → `dist/`. Still emits despite the type error, but exits non-zero |
| Run build | `npm run start:prod` | `node dist/server.js`. `npm start` is only `tsc --watch` and does **not** start the server |
| Seed | `npm run seed` | Runs `defaultTask()` and exits |
| Scaffold module | `npm run generate` | Interactive: asks for the parent path (`src/app/modules`) and the module name. The generated service imports `../../builder/QueryBuilder`; change it to `../../class/builder/QueryBuilder` |
| Lint | `ESLINT_USE_FLAT_CONFIG=false npx eslint --ext .ts src` | `npm run lint:check` is broken: ESLint 8.57 prefers `eslint.config.mjs`, which imports packages that are not installed (`globals`, `typescript-eslint`). Forcing the legacy `.eslintrc` works; about 35 errors already exist |

- There are no tests (`npm test` is a stub), and no git hooks are active.
- Prettier settings: single quotes, semicolons, `arrowParens: avoid`. `npm run prettier:check` actually rewrites files (`--write`).
- `dist/` is committed and gets rebuilt with `src` changes. Regenerate it with `npm run build` and never edit it by hand. It also contains stale output from deleted modules.

## Runtime requirements

- **`.env` at the repo root.** All env access goes through `src/app/config/index.ts`. The optional `ADMIN_DASHBOARD_URL` is the base URL for admin-dashboard links in emails; it falls back to `CLIENT_URL`.
- **`src/app/firebase/firebase.json`** (gitignored). `src/app/utils/firebase.ts` initializes firebase-admin when imported, so the server crashes at boot if this file is missing.
- **MongoDB with transaction support** (a replica set or Atlas). `acceptOffer` and FAQ reorder use sessions.
- **Start from the repo root.** The PDF templates (`offer_agreement.pdf`, `ohio_property_agreement.pdf`, `kentuncky_property_agreement.pdf`) are loaded via `process.cwd()`.
- **Startup order** (`src/server.ts`): connect Mongo → `defaultTask()` → Socket.IO on `SOCKET_PORT` → HTTP on `PORT`/`IP`.
  - `defaultTask()` creates a default admin user and a `Contents` doc if missing, and runs one-time data backfills.
  - Because `defaultTask()` runs on every boot, any migration added there must be idempotent.

## Architecture

### Module pattern
- **Location:** each feature lives in `src/app/modules/<name>/` as `.route`, `.controller`, `.service`, `.validation`, `.models` (sometimes `.model`), `.interface`, `.constants` and `.utils`. Routers are registered in `src/app/routes/index.ts`; `dashboard` lives outside `modules/`.
- **Filenames are inconsistent** (`otp.routes.ts`, `notificaiton.route.ts`, `.model.ts` vs `.models.ts`), so check the real name before importing.
- **Controllers:** wrap in `catchAsync` and reply with `sendResponse(res, { statusCode, success, message, data, meta })`.
- **Errors:** services throw `AppError(httpStatus.X, msg)`. `middleware/globalErrorhandler.ts` normalizes Zod, Mongoose validation/cast/duplicate-key and Multer errors into `{ success: false, message, errorSources }`.
- **List endpoints:** build the query with `new QueryBuilder(Model.find(), req.query).search(fields).filter().sort().paginate().fields()`, then return `{ data, meta }` using `countTotal()`. Preferred controller style passes `data: result.data, meta: result.meta`; some older controllers nest the whole object under `data`.
- **Validation:** `validateRequest(schema)` parses only `{ body, files, file, cookies }`. Schemas must therefore be `z.object({ body: z.object({...}) })`, and params and query are never validated.
- **Soft delete:** models carry `isDeleted` plus `pre('find' | 'findOne' | 'aggregate')` hooks that hide deleted docs. "Delete" means setting `isDeleted: true`. `countDocuments` is not covered by these hooks.

### Auth
- **Mechanism:** `auth(...roles)` reads `Authorization: Bearer <jwt>` and sets `req.user` (`{ userId, role, ... }`).
- **Roles** (`USER_ROLE`): `user`, `admin`, `sub_admin`, `super_admin`.
- **No hierarchy:** `auth(USER_ROLE.admin)` rejects `super_admin`, so list every role you allow. `auth()` with no arguments rejects everyone.

### Multipart uploads
Middleware order matters:

1. `upload.fields(...)` (multer `memoryStorage`)
2. `parseData()`: the JSON payload arrives as a form field named `data` and replaces `req.body`
3. A module upload middleware (`properties.upload.middleware.ts`, `offer.upload.middleware.ts`): pushes buffers to S3 via `utils/s3.ts` and writes the resulting **URLs** into `req.body`
4. `validateRequest`: Zod sees URLs, not files
5. The controller

Further details:
- Property photos are ordered by a `photoOrder` array of `{type:'url',url}` / `{type:'file',index}` entries. This array also decides which existing photos are kept; dropped ones are deleted from S3 (`properties.files.ts`).
- S3 is an S3-compatible endpoint (`S3_API`). Public URLs are `${S3_BASE_URL}/${key}`.
- `middleware/fileUpload.ts` (disk storage) is legacy.

### Core business flow
- **Property status** (`STATUS` in `properties.constants.ts`): `Pending` on create → admin approves to `Active` (or `Rejected`) → `Under Contract` when an offer is accepted → `Sold` when the agreement is fully signed. The constant key is spelled `STATUS.under_contact`.
- **Offers:** status goes `pending` ↔ `countered`; the latest terms live in `currentTerms`. `accepted`, `rejected` and `withdrawn` are terminal (`CLOSED_OFFER_STATUSES`).
- **`acceptOffer`** runs in a transaction. It:
  - sets the property to Under Contract;
  - fills the PDF form templates with pdf-lib in `offer.utils.ts`: `offer_agreement.pdf` plus the Ohio or Kentucky property agreement, chosen by `property.countyType === 'OHIO'`;
  - uploads both PDFs to S3;
  - creates an `Agreement`.
- **Agreements** are keyed by **offer id** in routes.
  1. Each side adds authorized signers (`/agreements/seller-authorize/:offerId`, `/buyer-authorize/:offerId`).
  2. Each signer is emailed `${CLIENT_URL}/agreement/<offerId>?email=…&user=seller|buyer`.
  3. `PATCH /agreements/:offerId/sign` is **unauthenticated**; the signer is matched by email plus role.
  4. `agreement.utils.ts` downloads the current PDF from S3, stamps names, signatures and dates at hard-coded coordinates, and re-uploads it.
  5. When every buyer and seller signer has signed, the agreement becomes `completed`, the property becomes `Sold`, and completion emails go out.
- **Template coupling:** form field names and coordinate layouts in `offer.utils.ts` and `agreement.utils.ts` are tied to those exact PDF files, so update the code whenever a template changes.
- **Ohio check mismatch:** generation checks `countyType` for Ohio, but signing checks `property.state`.

### Notifications and email
- **`sendNotificationMessage`** (`modules/notification/notification.utils.ts`) saves a `Notification` doc and sends an FCM push if the user has an `fcmToken`. It is usually called fire-and-forget.
- **Email** goes through `utils/mailSender.ts` (nodemailer, Gmail SMTP).
- **Templates** are `public/view/*.html` with `{{placeholder}}` string replacement. Use `utils/activityEmail.ts` (`sendActivityEmail`) for generic activity emails because it HTML-escapes values.
- **`public/`** is served statically.

### Realtime (`src/app/socket/`)
- **Port:** Socket.IO listens on `SOCKET_PORT`, separate from the REST `PORT`.
- **Handshake:** the JWT is read from `handshake.auth.token` or `headers.token`.
- **Online users** are an in-memory map (`socket/utils/onlineUsers.ts`), so this assumes a single process. The redis adapter, bullmq and cron dependencies are installed but unused.
- **Client events:** `message_page`, `my_chat_list`, `seen`, `send_message`, `typing`. The server emits `typing::<chatId>`.
- **Emitting from REST code:** use `getIO()` from `socket/utils/io.ts`.

### Frontend coupling
`BASIC_INFO_CONFIG` in `properties.constants.ts` mirrors a frontend config and must be kept in sync with it.
