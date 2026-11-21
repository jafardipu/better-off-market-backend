import { Schema, model, Types } from 'mongoose';

export interface IOpenHouseRsvp {
    property: Types.ObjectId;
    seller: Types.ObjectId;
    buyer: Types.ObjectId;
    createdAt?: Date;
}

const openHouseRsvpSchema = new Schema<IOpenHouseRsvp>(
    {
        property: { type: Schema.Types.ObjectId, ref: 'Property', required: true },
        seller: { type: Schema.Types.ObjectId, ref: 'User', required: true },
        buyer: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    },
    { timestamps: { createdAt: true, updatedAt: false } },
);

openHouseRsvpSchema.index({ property: 1, buyer: 1 }, { unique: true });
openHouseRsvpSchema.index({ seller: 1, createdAt: -1 });
openHouseRsvpSchema.index({ buyer: 1, createdAt: -1 });

export const OpenHouseRsvp = model<IOpenHouseRsvp>(
    'OpenHouseRsvp',
    openHouseRsvpSchema,
);
