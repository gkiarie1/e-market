export type Role = 'buyer' | 'farmer';
export type Profile = {
    id: string;
    name: string;
    role: Role;
    phone: string;
    alternate: string;
    area: string;
    produce: string;
    latitude?: number;
    longitude?: number;
};
export type Listing = {
    id: string;
    farmerId: string;
    seller: string;
    name: string;
    area: string;
    phone: string;
    alternate: string;
    price: number;
    quantity: number;
    unit: string;
    bulk: boolean;
    minimum: number;
    image?: string;
    emoji: string;
    rating?: number;
    purchaseCount?: number;
    distanceKm?: number;
};
export type Review = {
    id: string;
    farmerId: string;
    author: string;
    rating: number;
    text: string;
};
export type Order = {
    id: string;
    buyerId: string;
    items: {
        listing: Listing;
        quantity: number;
    }[];
    total: number;
    date: string;
    payment: string;
    status: 'Awaiting seller confirmation' | 'Confirmed' | 'Completed' | 'Cancelled';
};
export type Message = {
    id: string;
    senderId: string;
    recipientId: string;
    text: string;
    date: string;
};
export type State = {
    profile: Profile | null;
    listings: Listing[];
    reviews: Review[];
    orders: Order[];
    messages: Message[];
    cart: Record<string, number>;
};
export const emptyState: State = { profile: null, cart: {}, orders: [], messages: [], reviews: [], listings: [] };
export const money = (n: number) => `KSh ${n.toLocaleString()}`;
export function rating(state: State, farmerId: string) { const reviews = state.reviews.filter(r => r.farmerId === farmerId); return reviews.length ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length : 0; }
