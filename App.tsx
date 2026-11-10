import React, { useEffect, useState, useRef } from 'react';
import { ActivityIndicator, Alert, Image, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import { StatusBar } from 'expo-status-bar';
import { State, Profile, Listing, Review, Order, Message, emptyState, money, rating } from './src/model';
import * as F from './src/firebase';
import * as API from './src/api';
const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
const notify = (text: string) => Platform.OS === 'web' ? window.alert(text) : Alert.alert('Shamba Market', text);
function Button({ title, onPress, secondary = false }: {
    title: string;
    onPress: () => void;
    secondary?: boolean;
}) { return <Pressable accessibilityRole="button" onPress={onPress} style={[s.button, secondary && s.secondary]}><Text style={[s.buttonText, secondary && { color: '#215b39' }]}>{title}</Text></Pressable>; }
function Field({ label, value, onChangeText, secure = false, numeric = false }: {
    label: string;
    value: string;
    onChangeText: (v: string) => void;
    secure?: boolean;
    numeric?: boolean;
}) { return <View style={{ gap: 6 }}><Text style={s.label}>{label}</Text><TextInput accessibilityLabel={label} placeholder={label} placeholderTextColor="#89968c" value={value} onChangeText={onChangeText} secureTextEntry={secure} keyboardType={numeric ? 'decimal-pad' : 'default'} autoCapitalize={secure ? 'none' : 'sentences'} style={s.input}/></View>; }
export default function App() {
    return <SafeAreaProvider><MarketplaceApp/></SafeAreaProvider>;
}
function MarketplaceApp() {
    const [state, setState] = useState<State>(emptyState), [busy, setBusy] = useState(false), [tab, setTab] = useState('Market'), [selected, setSelected] = useState<Listing | null>(null), [chat, setChat] = useState<{
        id: string;
        name: string;
    } | null>(null);
    const [register, setRegister] = useState(false), [role, setRole] = useState<'buyer' | 'farmer'>('buyer'), [email, setEmail] = useState(''), [password, setPassword] = useState(''), [name, setName] = useState(''), [phone, setPhone] = useState(''), [alternate, setAlternate] = useState(''), [area, setArea] = useState(''), [produce, setProduce] = useState(''), [coords, setCoords] = useState<{
        latitude: number;
        longitude: number;
    } | null>(null);
    const [search, setSearch] = useState(''), [nearby, setNearby] = useState(false), [sort, setSort] = useState('Top rated'), [comment, setComment] = useState(''), [stars, setStars] = useState(5), [message, setMessage] = useState(''), [payment, setPayment] = useState('Cash on collection');
    const [product, setProduct] = useState(''), [price, setPrice] = useState(''), [quantity, setQuantity] = useState(''), [unit, setUnit] = useState('kg'), [bulk, setBulk] = useState(false), [minimum, setMinimum] = useState('10'), [photo, setPhoto] = useState('');
    const profile = state.profile;
    const currentAccount = useRef<string | undefined>(undefined);
    currentAccount.current = profile?.id;
    const [analytics, setAnalytics] = useState<{
        Completed?: {
            value: number;
        };
        summary?: {
            rating: number;
            listingCount: number;
            orderCount: number;
        };
    }>({});
    const [marketListings, setMarketListings] = useState<Listing[]>([]);
    const [chatConnected, setChatConnected] = useState(false);
    const [chatError, setChatError] = useState('');
    const [contacts, setContacts] = useState<{
        id: string;
        name: string;
    }[]>([]);
    const [checkoutKey, setCheckoutKey] = useState(uid());
    async function refresh() {
        const [items, orders, reviews, report] = await Promise.all([API.getListings(profile?.role === 'farmer' ? 'mine=true' : ''), API.getOrders(), API.getReviews(), profile?.role === 'farmer' ? API.request<typeof analytics>('/analytics') : Promise.resolve({})]);
        if (currentAccount.current === profile?.id)
            setAnalytics(report);
        setState(v => v.profile?.id === profile?.id ? ({ ...v, listings: [...v.listings.filter(l => !items.some(i => i.id === l.id)), ...items], orders, reviews }) : v);
    }
    async function connectChat() {
        const account = currentAccount.current;
        if (!account)
            return;
        setChatError('');
        try {
            await F.connect();
            if (currentAccount.current === account)
                setChatConnected(true);
            else
                await F.disconnect();
        }
        catch (error) {
            setChatConnected(false);
            setChatError(error instanceof Error ? error.message : 'Live chat is unavailable.');
        }
    }
    useEffect(() => { setCheckoutKey(uid()); }, [state.cart, payment]);
    useEffect(() => {
        if (!profile)
            return;
        refresh().catch(e => notify(e.message));
        connectChat();
        const interval = setInterval(() => { refresh().catch(() => { }); }, 30000);
        const chatInterval = setInterval(connectChat, 45 * 60 * 1000);
        return () => { clearInterval(interval); clearInterval(chatInterval); };
    }, [profile?.id]);
    useEffect(() => {
        if (!profile || !chatConnected)
            return;
        const onError = (error: Error) => { setChatConnected(false); setChatError(error.message); };
        const stopMessages = F.listenMessages(profile.id, messages => setState(v => ({ ...v, messages })), onError);
        const stopContacts = F.listenConversations(profile.id, setContacts, onError);
        return () => { stopMessages(); stopContacts(); };
    }, [profile?.id, chatConnected]);
    useEffect(() => {
        if (!profile || profile.role !== 'buyer')
            return;
        let active = true;
        const timer = setTimeout(() => {
            const params = new URLSearchParams({ q: search, sort: sort === 'Popular' ? 'popular' : 'rating' });
            if (nearby) {
                if (coords) {
                    params.set('latitude', String(coords.latitude));
                    params.set('longitude', String(coords.longitude));
                    params.set('radiusKm', '30');
                }
                else
                    params.set('area', profile.area);
            }
            API.getListings(params.toString()).then(items => {
                if (active) {
                    setMarketListings(items);
                    setState(v => ({ ...v, listings: [...v.listings.filter(l => !items.some(i => i.id === l.id)), ...items] }));
                }
            }).catch(e => {
                if (active)
                    notify(e.message);
            });
        }, 300);
        return () => { active = false; clearTimeout(timer); };
    }, [profile?.id, search, nearby, coords, sort, state.orders]);
    async function action(fn: () => Promise<void>) {
        if (busy)
            return;
        setBusy(true);
        try {
            await fn();
        }
        catch (e) {
            notify(e instanceof Error ? e.message : 'Something went wrong. Please try again.');
        }
        finally {
            setBusy(false);
        }
    }
    async function locate() {
        await action(async () => {
            const permission = await Location.requestForegroundPermissionsAsync();
            if (permission.status !== 'granted')
                throw new Error('Location permission is required for nearby search. You can still browse all sellers.');
            const result = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
            setCoords({ latitude: result.coords.latitude, longitude: result.coords.longitude });
            const addresses = await Location.reverseGeocodeAsync(result.coords);
            if (addresses[0])
                setArea(addresses[0].city || addresses[0].subregion || addresses[0].region || '');
        });
    }
    async function enter() {
        await action(async () => {
            if (!email.trim() || !password)
                throw new Error('Enter your email and password.');
            if (register && password.length < 10)
                throw new Error('Use at least 10 characters for your password.');
            if (register && (!name.trim() || !phone.trim() || !area.trim() || (role === 'farmer' && (!alternate.trim() || !produce.trim() || !coords))))
                throw new Error('Complete your profile and share your farm location.');
            const credentials = { email: email.trim(), password };
            const data = register ? { ...credentials, name: name.trim(), role, phone, alternate, area, produce, ...(role === 'farmer' ? { ...coords, locationConsent: true } : {}) } : credentials;
            const result = await API.login(data, register);
            API.setToken(result.token);
            setState({ ...emptyState, profile: result.profile });
            setTab(result.profile.role === 'farmer' ? 'My farm' : 'Market');
            setPassword('');
            setCoords(null);
            setArea(result.profile.area);
        });
    }
    async function publish() {
        await action(async () => {
            const p = Number(price), q = Number(quantity), min = bulk ? Number(minimum) : 1;
            if (!product.trim() || !photo || !Number.isFinite(p) || p <= 0 || !Number.isInteger(q) || q < 1 || !Number.isInteger(min) || min < 1 || min > q || !unit.trim())
                throw new Error('Add a photo, name, valid price, whole quantity, and minimum order within stock.');
            const image = await API.uploadPhoto(photo);
            await API.request('/listings', 'POST', { name: product.trim(), price: p, quantity: q, unit, bulk, minimum: min, image: image.path });
            await refresh();
            setProduct('');
            setPhoto('');
            setPrice('');
            setQuantity('');
            setTab('My farm');
        });
    }
    async function pick(camera: boolean) {
        await action(async () => {
            const permission = camera ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
            if (!permission.granted)
                throw new Error('Please allow photo access in your device settings.');
            const result = camera ? await ImagePicker.launchCameraAsync({ quality: 0.7 }) : await ImagePicker.launchImageLibraryAsync({ quality: 0.7, mediaTypes: ['images'] });
            if (!result.canceled)
                setPhoto(result.assets[0].uri);
        });
    }
    const cartItems = Object.entries(state.cart).map(([id, q]) => ({ listing: state.listings.find(l => l.id === id)!, quantity: q })).filter(i => i.listing);
    const total = cartItems.reduce((n, i) => n + i.quantity * i.listing.price, 0);
    function add(l: Listing) {
        const next = (state.cart[l.id] || 0) + (state.cart[l.id] ? 1 : l.minimum);
        if (next > l.quantity) {
            notify('There is not enough stock for this quantity.');
            return;
        }
        setState(v => ({ ...v, cart: { ...v.cart, [l.id]: next } }));
    }
    async function checkout() {
        await action(async () => {
            if (!cartItems.length)
                return;
            await API.request('/orders', 'POST', { requestKey: checkoutKey, items: cartItems.map(i => ({ listingId: i.listing.id, quantity: i.quantity })), payment });
            setState(v => ({ ...v, cart: {} }));
            setCheckoutKey(uid());
            await refresh();
            setTab('History');
            notify('Order requests sent and stock reserved. Agree collection and payment with your farmers.');
        });
    }
    async function review() {
        await action(async () => {
            if (!selected || !comment.trim())
                return;
            await API.request('/reviews', 'POST', { farmerId: selected.farmerId, rating: stars, text: comment.trim() });
            setComment('');
            await refresh();
        });
    }
    async function send() {
        await action(async () => {
            if (!profile || !chat || !message.trim())
                return;
            if (!chatConnected)
                throw new Error('Live chat is disconnected. Reconnect and try again.');
            await F.send({ id: uid(), senderId: profile.id, recipientId: chat.id, text: message.trim(), date: new Date().toISOString() });
            setMessage('');
        });
    }
    async function updateStatus(id: string, status: Order['status']) { await action(async () => { await API.request('/orders/' + id, 'PATCH', { status }); await refresh(); }); }
    async function logout() {
        await action(async () => {
            try {
                await API.request('/auth/logout', 'POST');
            }
            finally {
                await F.disconnect().catch(() => { });
                API.setToken(null);
                setState(emptyState);
                setSelected(null);
                setChat(null);
                setChatConnected(false);
                setContacts([]);
                setCoords(null);
                setMarketListings([]);
                setAnalytics({});
            }
        });
    }
    async function saveFarmLocation() {
        await action(async () => {
            if (!coords)
                throw new Error('Capture your current location first.');
            const updated = await API.request<Profile>('/me/location', 'PATCH', { ...coords, area, consent: true });
            setState(v => ({ ...v, profile: updated }));
            notify('Farm location updated. Buyers see your area, not exact coordinates.');
        });
    }
    const tabs = profile?.role === 'farmer' ? ['My farm', 'Add produce', 'Analytics', 'Messages'] : ['Market', 'Cart', 'History', 'Messages'];
    const listings = marketListings;
    return <SafeAreaView style={s.safe}><StatusBar style="dark"/><View style={s.container}><View style={s.header}><View><Text style={s.brand}>🌱 shamba<Text style={{ color: '#92a760' }}>market</Text></Text><Text style={s.muted}>Fresh from the farm. Fair for everyone.</Text></View>{profile && <Pressable onPress={logout}><Text style={s.link}>Log out</Text></Pressable>}</View>
 {profile && chatError && <View style={s.banner}><Text>{chatError}</Text><Button title="Reconnect chat" secondary onPress={connectChat}/></View>}
 <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
 {!profile ? <View style={s.auth}><Text style={s.kicker}>GROWING CONNECTIONS</Text><Text style={s.hero}>Good food starts{'\n'}with good people.</Text><Text style={s.subtitle}>Buy fresh, sell your harvest, and connect directly with your community.</Text><View style={s.row}>{(['buyer', 'farmer'] as const).map(r => <Button key={r} title={r === 'buyer' ? '🛒 I’m a buyer' : '🌾 I’m a farmer'} secondary={role !== r} onPress={() => setRole(r)}/>)}</View><Text style={s.title}>{register ? 'Create your account' : 'Welcome back'}</Text>{register && <Field label="Full name" value={name} onChangeText={setName}/>}{<><Field label="Email" value={email} onChangeText={setEmail}/><Field label="Password" value={password} onChangeText={setPassword} secure/></>}{register && <><Field label="Phone number" value={phone} onChangeText={setPhone}/><Field label="Your area" value={area} onChangeText={setArea}/>{role === 'farmer' && <><Field label="Alternative contact" value={alternate} onChangeText={setAlternate}/><Field label="What do you grow or sell?" value={produce} onChangeText={setProduce}/><Text style={s.muted}>Share your farm’s location to help nearby buyers find you. We store coordinates privately and display your area. Only capture this while at your farm.</Text><Button title={coords ? '✓ Farm location captured' : '📍 Share farm location'} secondary onPress={locate}/></>}</>}<Button title={busy ? 'Please wait…' : (register ? 'Create account' : 'Log in')} onPress={enter}/>{<Button secondary title={register ? 'Already registered? Log in' : 'New here? Register'} onPress={() => setRegister(!register)}/>}</View> : chat ? <><Button secondary title="← Back to messages" onPress={() => setChat(null)}/><Text style={s.title}>{chat.name}</Text><Text style={s.muted}>{chatConnected ? 'Live chat connected' : 'Live chat disconnected'}</Text>{state.messages.filter(m => (m.senderId === profile.id && m.recipientId === chat.id) || (m.senderId === chat.id && m.recipientId === profile.id)).sort((a, b) => a.date.localeCompare(b.date)).map(m => <View key={m.id} style={[s.bubble, m.senderId === profile.id && s.ownBubble]}><Text>{m.text}</Text><Text style={s.muted}>{new Date(m.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text></View>)}<Field label="Write a message" value={message} onChangeText={setMessage}/><Button title="Send message" onPress={send}/></> : selected ? <><Button secondary title="← Back to market" onPress={() => setSelected(null)}/>{selected.image ? <Image source={{ uri: selected.image }} style={s.detailImage}/> : <Text style={s.bigEmoji}>{selected.emoji}</Text>}<Text style={s.title}>{selected.name}</Text><Text style={s.subtitle}>{selected.seller} · {selected.area}</Text><Text style={s.price}>{money(selected.price)} / {selected.unit}</Text><Text>{selected.quantity} {selected.unit} available · {selected.bulk ? `Bulk · minimum ${selected.minimum}` : 'Retail available'}</Text><Text>Contact: {selected.phone}{selected.alternate ? ` · Alternative: ${selected.alternate}` : ''}</Text><Button title="Add to cart" onPress={() => add(selected)}/><Button secondary title="Chat with farmer" onPress={() => { setChat({ id: selected.farmerId, name: selected.seller }); setSelected(null); }}/><Text style={s.title}>From the community · ★ {rating(state, selected.farmerId).toFixed(1)}</Text>{state.reviews.filter(r => r.farmerId === selected.farmerId).map(r => <View key={r.id} style={s.card}><Text style={s.label}>{r.author} · {'★'.repeat(r.rating)}</Text><Text>{r.text}</Text></View>)}<View style={s.row}>{[1, 2, 3, 4, 5].map(n => <Pressable accessibilityLabel={`${n} stars`} key={n} onPress={() => setStars(n)}><Text style={{ fontSize: 32, color: n <= stars ? '#d49b28' : '#cdd6ce' }}>★</Text></Pressable>)}</View><Field label="Share your experience" value={comment} onChangeText={setComment}/><Button title="Post review" onPress={review}/></> : <>
 {tab === 'Market' && <><Text style={s.kicker}>YOUR LOCAL HARVEST</Text><Text style={s.hero}>Fresh picks,{'\n'}closer to home.</Text><Text style={s.subtitle}>Discover the people behind your produce.</Text><Field label="Search produce, farmers, or area" value={search} onChangeText={setSearch}/><View style={s.row}><Text style={{ flex: 1 }}>Only nearby sellers {coords ? '(30 km)' : `(${profile.area || 'set your area'})`}</Text><Switch value={nearby} onValueChange={setNearby} trackColor={{ true: '#92a760' }}/></View><Button title="📍 Use my current location" secondary onPress={locate}/><View style={s.row}>{['Top rated', 'Popular'].map(v => <Button key={v} title={v} secondary={sort !== v} onPress={() => setSort(v)}/>)}</View><Text style={s.title}>Meet your next fresh find <Text style={s.muted}>({listings.length})</Text></Text><View style={s.grid}>{listings.map(l => <Pressable accessibilityRole="button" key={l.id} onPress={() => setSelected(l)} style={s.product}>{l.image ? <Image source={{ uri: l.image }} style={s.productImage}/> : <View style={s.productArt}><Text style={{ fontSize: 65 }}>{l.emoji}</Text></View>}<View style={{ padding: 15, gap: 6 }}><Text style={s.badge}>{l.bulk ? 'BULK HARVEST' : 'FARM FRESH'}</Text><Text style={s.productName}>{l.name}</Text><Text style={s.muted}>{l.seller} · {l.area}{l.distanceKm != null ? ` · about ${l.distanceKm} km` : ""}</Text><Text style={s.price}>{money(l.price)} <Text style={s.muted}>/ {l.unit}</Text></Text><Text style={s.muted}>★ {(l.rating ?? rating(state, l.farmerId)).toFixed(1)} · {l.quantity} {l.unit} available</Text></View></Pressable>)}</View>{!listings.length && <Text style={s.empty}>No produce found. Try another search or turn off the nearby filter.</Text>}</>}
 {tab === 'Cart' && <><Text style={s.title}>Your basket</Text>{!cartItems.length && <Text style={s.empty}>Your basket is ready for something fresh.</Text>}{cartItems.map(i => <View key={i.listing.id} style={s.card}><Text style={s.productName}>{i.listing.name}</Text><Text>{i.listing.seller} · {money(i.listing.price)} / {i.listing.unit}</Text><View style={s.row}><Button secondary title="−" onPress={() => setState(v => {
                        const cart = { ...v.cart };
                        if (cart[i.listing.id] <= i.listing.minimum)
                            delete cart[i.listing.id];
                        else
                            cart[i.listing.id]--;
                        return { ...v, cart };
                    })}/><Text>{i.quantity}</Text><Button secondary title="+" onPress={() => add(i.listing)}/><Text style={s.price}>{money(i.quantity * i.listing.price)}</Text></View></View>)}{!!cartItems.length && <><Text style={s.title}>Total {money(total)}</Text><Text style={s.subtitle}>Choose how you intend to pay. Stock is reserved when you place the request. Agree payment and collection with each seller.</Text>{['Cash on collection', 'Cash on delivery', 'Bank transfer arranged with seller'].map(p => <Button key={p} secondary={payment !== p} title={p} onPress={() => setPayment(p)}/>)}<Button title="Send order request" onPress={checkout}/><Text style={s.muted}>No payment is collected in the app. Delivery arrangements are agreed with the farmer.</Text></>}</>}
 {tab === 'History' && <><Text style={s.title}>Your purchases</Text>{state.orders.filter(o => o.buyerId === profile.id).map(o => <View key={o.id} style={s.card}><Text style={s.label}>{new Date(o.date).toLocaleDateString()} · {money(o.total)}</Text><Text>{o.items.map(i => `${i.listing.name} × ${i.quantity}`).join(', ')}</Text><Text style={s.badge}>{o.status}</Text><Text>{o.payment}</Text>{['Awaiting seller confirmation', 'Confirmed'].includes(o.status) && <Button secondary title="Cancel order & release stock" onPress={() => updateStatus(o.id, 'Cancelled')}/>}{[...new Map(o.items.map(i => [i.listing.farmerId, i.listing])).values()].map(l => <Button key={l.farmerId} secondary title={`Chat with ${l.seller}`} onPress={() => setChat({ id: l.farmerId, name: l.seller })}/>)}</View>)}{!state.orders.some(o => o.buyerId === profile.id) && <Text style={s.empty}>Your order requests will appear here.</Text>}</>}
 {tab === 'My farm' && <><Text style={s.kicker}>HELLO, {profile.name.toUpperCase()}</Text><Text style={s.hero}>Your farm,{'\n'}a little more connected.</Text><Text style={s.subtitle}>{profile.area} · {profile.produce}</Text><Button secondary title="📍 Capture current farm location" onPress={locate}/>{coords && <><Field label="Farm area" value={area} onChangeText={setArea}/><Text style={s.muted}>Saving stores your coordinates privately and updates the area on your listings. Capture only while at your farm.</Text><Button secondary title="Save as my farm location" onPress={saveFarmLocation}/></>}<Button title="+ Add your harvest" onPress={() => setTab('Add produce')}/><Text style={s.title}>Your produce</Text>{state.listings.filter(l => l.farmerId === profile.id).map(l => <View key={l.id} style={s.card}><Text style={s.productName}>{l.name}</Text><Text>{money(l.price)} / {l.unit} · {l.quantity} available</Text><Text>{l.bulk ? `Bulk orders from ${l.minimum} ${l.unit}` : 'Retail orders welcome'}</Text></View>)}{!state.listings.some(l => l.farmerId === profile.id) && <Text style={s.empty}>Your first harvest belongs here. Add a photo and start selling.</Text>}</>}
 {tab === 'Add produce' && <><Text style={s.title}>Share your harvest</Text><Text style={s.subtitle}>Let buyers see what’s fresh on your farm.</Text>{photo && <Image source={{ uri: photo }} style={s.detailImage}/>}<View style={s.row}><Button secondary title="📷 Take photo" onPress={() => pick(true)}/><Button secondary title="Choose photo" onPress={() => pick(false)}/></View><Field label="Produce name" value={product} onChangeText={setProduct}/><Field label="Price per unit (KSh)" value={price} onChangeText={setPrice} numeric/><Field label="Quantity available (whole units)" value={quantity} onChangeText={setQuantity} numeric/><Field label="Unit (kg, crate, bunch…)" value={unit} onChangeText={setUnit}/><View style={s.row}><Text style={{ flex: 1 }}>Sell in bulk</Text><Switch value={bulk} onValueChange={setBulk}/></View>{bulk && <Field label="Minimum order quantity" value={minimum} onChangeText={setMinimum} numeric/>}<Button title={busy ? 'Publishing…' : 'Publish produce'} onPress={publish}/></>}
 {tab === 'Analytics' && <><Text style={s.kicker}>YOUR FARM AT A GLANCE</Text><Text style={s.title}>Sales & insights</Text><Text style={s.subtitle}>Completed sales are orders you have marked collected and paid. Pending orders reserve stock until completed or cancelled.</Text><View style={s.card}><Text style={s.muted}>Completed sales value</Text><Text style={s.hero}>{money(analytics.Completed?.value || 0)}</Text></View><View style={s.card}><Text style={s.productName}>{analytics.summary?.orderCount || 0} orders</Text><Text>★ {(analytics.summary?.rating || 0).toFixed(1)} average rating</Text><Text>{analytics.summary?.listingCount || 0} produce listings</Text></View>{state.orders.filter(o => o.items.some(i => i.listing.farmerId === profile.id)).map(o => <View style={s.card} key={o.id}><Text style={s.label}>{new Date(o.date).toLocaleDateString()}</Text>{o.items.filter(i => i.listing.farmerId === profile.id).map(i => <Text key={i.listing.id}>{i.listing.name} × {i.quantity} · {money(i.quantity * i.listing.price)}</Text>)}<Text>{o.status}</Text>{o.status === 'Awaiting seller confirmation' && <Button title="Confirm order" onPress={() => updateStatus(o.id, 'Confirmed')}/>}{o.status === 'Confirmed' && <Button title="Mark collected & paid" onPress={() => updateStatus(o.id, 'Completed')}/>}{['Awaiting seller confirmation', 'Confirmed'].includes(o.status) && <Button secondary title="Cancel & release stock" onPress={() => updateStatus(o.id, 'Cancelled')}/>}<Button secondary title="Message buyer" onPress={() => setChat({ id: o.buyerId, name: 'Buyer' })}/></View>)}</>}
 {tab === 'Messages' && <><Text style={s.title}>Conversations</Text><Text style={s.subtitle}>Talk harvests, delivery, and everything in between.</Text>{contacts.map(contact => <Button key={contact.id} secondary title={contact.name} onPress={() => setChat(contact)}/>)}{!state.messages.length && <Text style={s.empty}>No conversations yet. Open a seller’s page or an order to start a chat.</Text>}</>}
 </>}
 {busy && <ActivityIndicator color="#215b39"/>}
 </ScrollView>{profile && !selected && !chat && <View style={s.nav}>{tabs.map((t, i) => <Pressable accessibilityRole="tab" accessibilityState={{ selected: tab === t }} key={t} onPress={() => setTab(t)} style={s.navItem}><Text style={{ fontSize: 20 }}>{(profile.role === 'farmer' ? ['🌾', '⊕', '▥', '☏'] : ['⌂', '🛒', '▤', '☏'])[i]}</Text><Text style={[s.navText, tab === t && s.active]}>{t}{t === 'Cart' && cartItems.length ? ` (${cartItems.length})` : ''}</Text></Pressable>)}</View>}</View></SafeAreaView>;
}
const s = StyleSheet.create({ safe: { flex: 1, backgroundColor: '#f8faf5' }, container: { flex: 1, width: '100%', maxWidth: 1050, alignSelf: 'center' }, loading: { flex: 1, justifyContent: 'center' }, header: { padding: 22, borderBottomWidth: 1, borderColor: '#e2e8de', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 }, brand: { fontSize: 25, fontWeight: '800', color: '#215b39', letterSpacing: -1 }, muted: { color: '#75816f', fontSize: 12, lineHeight: 19 }, banner: { backgroundColor: '#f9eccb', color: '#76551e', padding: 10, fontSize: 11, textAlign: 'center' }, content: { padding: 22, gap: 18, paddingBottom: 48 }, auth: { gap: 18, maxWidth: 500, width: '100%', alignSelf: 'center' }, kicker: { color: '#748b43', fontSize: 11, fontWeight: '800', letterSpacing: 2, marginTop: 12 }, hero: { fontSize: 38, fontWeight: '800', color: '#244a32', letterSpacing: -1.5, lineHeight: 43 }, subtitle: { fontSize: 15, color: '#73806e', lineHeight: 23 }, title: { fontSize: 23, fontWeight: '700', color: '#244a32', marginTop: 8 }, label: { fontSize: 13, fontWeight: '600', color: '#34553e' }, input: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#dce4d7', borderRadius: 12, padding: 15, fontSize: 15, color: '#244a32', minHeight: 50 }, button: { backgroundColor: '#255d3c', paddingVertical: 14, paddingHorizontal: 18, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }, secondary: { backgroundColor: '#e9efdf' }, buttonText: { color: '#fff', fontWeight: '700', fontSize: 14 }, row: { flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap' }, link: { fontSize: 13, color: '#215b39', fontWeight: '600' }, grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 }, product: { width: '47%', flexGrow: 1, minWidth: 145, maxWidth: 470, backgroundColor: '#fff', borderRadius: 18, overflow: 'hidden', borderWidth: 1, borderColor: '#e4e8dd' }, productArt: { height: 145, backgroundColor: '#edf0dc', alignItems: 'center', justifyContent: 'center' }, productImage: { height: 145, width: '100%' }, productName: { fontSize: 17, fontWeight: '700', color: '#244a32' }, badge: { color: '#81904c', fontSize: 10, fontWeight: '800', letterSpacing: 1 }, price: { color: '#255d3c', fontSize: 19, fontWeight: '700' }, card: { padding: 20, backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: '#e2e8de', gap: 12 }, empty: { color: '#7a866f', lineHeight: 24, paddingVertical: 28, textAlign: 'center' }, nav: { flexDirection: 'row', borderTopWidth: 1, borderColor: '#e2e8de', backgroundColor: '#fff', paddingVertical: 12 }, navItem: { flex: 1, alignItems: 'center', gap: 5 }, navText: { fontSize: 11, color: '#89917e' }, active: { color: '#255d3c', fontWeight: '800' }, detailImage: { height: 250, width: '100%', borderRadius: 18 }, bigEmoji: { fontSize: 100, textAlign: 'center', backgroundColor: '#e9efdf', padding: 25, borderRadius: 18 }, bubble: { padding: 16, borderRadius: 15, backgroundColor: '#fff', alignSelf: 'flex-start', maxWidth: '85%', gap: 6 }, ownBubble: { backgroundColor: '#e3edd7', alignSelf: 'flex-end' } });
