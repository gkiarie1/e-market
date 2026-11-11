import React, { useEffect, useState, useRef } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  KeyboardAvoidingView,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import * as Location from "expo-location";
import * as ImagePicker from "expo-image-picker";
import { StatusBar } from "expo-status-bar";
import {
  State,
  Profile,
  Listing,
  Review,
  Order,
  Message,
  emptyState,
  money,
  rating,
  unitPrice,
} from "./src/model";
import * as F from "./src/firebase";
import * as API from "./src/api";
import Icon, { IconName } from "./src/components/Icon";
import AccountScreen from "./src/screens/AccountScreen";
import AuthScreen from "./src/screens/AuthScreen";
import { colors as c } from "./src/theme";
const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
const notify = (text: string) =>
  Platform.OS === "web"
    ? window.alert(text)
    : Alert.alert("Shamba Market", text);
function Button({
  title,
  onPress,
  secondary = false,
}: {
  title: string;
  onPress: () => void;
  secondary?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={[s.button, secondary && s.secondary]}
    >
      <Text style={[s.buttonText, secondary && { color: c.brown }]}>
        {title}
      </Text>
    </Pressable>
  );
}
function Field({
  label,
  value,
  onChangeText,
  secure = false,
  numeric = false,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  secure?: boolean;
  numeric?: boolean;
}) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={s.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        placeholder={label}
        placeholderTextColor={c.muted}
        selectionColor={c.clay}
        value={value}
        onChangeText={onChangeText}
        secureTextEntry={secure}
        keyboardType={numeric ? "decimal-pad" : "default"}
        autoCapitalize={secure ? "none" : "sentences"}
        style={s.input}
      />
    </View>
  );
}
export default function App() {
  return (
    <SafeAreaProvider>
      <MarketplaceApp />
    </SafeAreaProvider>
  );
}
function MarketplaceApp() {
  const [state, setState] = useState<State>(emptyState),
    [busy, setBusy] = useState(false),
    [tab, setTab] = useState("Market"),
    [selected, setSelected] = useState<Listing | null>(null),
    [chat, setChat] = useState<{
      id: string;
      name: string;
    } | null>(null);
  const [area, setArea] = useState("");
  const [coords, setCoords] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);
  const [search, setSearch] = useState(""),
    [nearby, setNearby] = useState(false),
    [sort, setSort] = useState("Top rated"),
    [comment, setComment] = useState(""),
    [stars, setStars] = useState(5),
    [message, setMessage] = useState(""),
    [payment, setPayment] = useState("Cash on collection");
  const [step, setStep] = useState(0),
    [wholesale, setWholesale] = useState(false),
    [wholesalePrice, setWholesalePrice] = useState("");
  const [notices, setNotices] = useState<
    {
      id: string;
      title: string;
      body: string;
      orderId: string;
      date: string;
      read: boolean;
    }[]
  >([]);
  const [toast, setToast] = useState("");
  const knownUpdates = useRef<{
    account?: string;
    notices: Set<string> | null;
    messages: Set<string> | null;
  }>({ notices: null, messages: null });
  const [reads, setReads] = useState<Record<string, string>>({});
  const contentScroll = useRef<React.ComponentRef<typeof ScrollView>>(null);
  useEffect(() => {
    contentScroll.current?.scrollTo({ y: 0, animated: false });
  }, [tab]);
  const chatScroll = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const [product, setProduct] = useState(""),
    [price, setPrice] = useState(""),
    [quantity, setQuantity] = useState(""),
    [unit, setUnit] = useState("kg"),
    [bulk, setBulk] = useState(false),
    [minimum, setMinimum] = useState("10"),
    [photo, setPhoto] = useState("");
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
  const [chatError, setChatError] = useState("");
  const [contacts, setContacts] = useState<
    {
      id: string;
      name: string;
    }[]
  >([]);
  const [checkoutKey, setCheckoutKey] = useState(uid());
  function announce(
    source: "notices" | "messages",
    updates: { id: string; text: string }[],
  ) {
    const account = currentAccount.current;
    if (knownUpdates.current.account !== account)
      knownUpdates.current = { account, notices: null, messages: null };
    const previous = knownUpdates.current[source];
    if (previous) {
      const fresh = updates.filter((item) => !previous.has(item.id));
      if (fresh.length) setToast(fresh[fresh.length - 1].text);
    }
    knownUpdates.current[source] = new Set(updates.map((item) => item.id));
  }
  async function refresh() {
    const [items, orders, reviews, report, notifications] = await Promise.all([
      API.getListings(profile?.role === "farmer" ? "mine=true" : ""),
      API.getOrders(),
      API.getReviews(),
      profile?.role === "farmer"
        ? API.request<typeof analytics>("/analytics")
        : Promise.resolve({}),
      API.request<typeof notices>("/notifications"),
    ]);
    if (currentAccount.current === profile?.id) {
      announce(
        "notices",
        notifications.map((n) => ({ id: n.id, text: n.title })),
      );
      setAnalytics(report);
      setNotices(notifications);
    }
    setState((v) =>
      v.profile?.id === profile?.id
        ? {
            ...v,
            listings: [
              ...v.listings.filter((l) => !items.some((i) => i.id === l.id)),
              ...items,
            ],
            orders,
            reviews,
          }
        : v,
    );
  }
  async function connectChat() {
    const account = currentAccount.current;
    if (!account) return;
    setChatError("");
    try {
      await F.connect();
      if (currentAccount.current === account) setChatConnected(true);
      else await F.disconnect();
    } catch (error) {
      setChatConnected(false);
      setChatError(
        error instanceof Error ? error.message : "Live chat is unavailable.",
      );
    }
  }
  useEffect(() => {
    setCheckoutKey(uid());
  }, [state.cart, payment]);
  useEffect(() => {
    if (!profile) return;
    refresh().catch((e) => notify(e.message));
    connectChat();
    const interval = setInterval(() => {
      refresh().catch(() => {});
    }, 30000);
    const chatInterval = setInterval(connectChat, 45 * 60 * 1000);
    return () => {
      clearInterval(interval);
      clearInterval(chatInterval);
    };
  }, [profile?.id]);
  useEffect(() => {
    if (!profile || !chatConnected) return;
    const onError = (error: Error) => {
      setChatConnected(false);
      setChatError(error.message);
    };
    const stopMessages = F.listenMessages(
      profile.id,
      (messages) => {
        if (currentAccount.current !== profile.id) return;
        announce(
          "messages",
          messages
            .filter((m) => m.recipientId === profile.id)
            .map((m) => ({ id: m.id, text: "New message · " + m.text })),
        );
        setState((v) => ({ ...v, messages }));
      },
      onError,
    );
    const stopContacts = F.listenConversations(
      profile.id,
      setContacts,
      onError,
    );
    return () => {
      stopMessages();
      stopContacts();
    };
  }, [profile?.id, chatConnected]);
  useEffect(() => {
    if (!profile || profile.role !== "buyer") return;
    let active = true;
    const timer = setTimeout(() => {
      const params = new URLSearchParams({
        q: search,
        sort: sort === "Popular" ? "popular" : "rating",
      });
      if (nearby) {
        if (coords) {
          params.set("latitude", String(coords.latitude));
          params.set("longitude", String(coords.longitude));
          params.set("radiusKm", "30");
        } else params.set("area", profile.area);
      }
      API.getListings(params.toString())
        .then((items) => {
          if (active) {
            setMarketListings(items);
            setState((v) => ({
              ...v,
              listings: [
                ...v.listings.filter((l) => !items.some((i) => i.id === l.id)),
                ...items,
              ],
            }));
          }
        })
        .catch((e) => {
          if (active) notify(e.message);
        });
    }, 300);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [profile?.id, profile?.area, search, nearby, coords, sort, state.orders]);
  async function action(fn: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      notify(
        e instanceof Error
          ? e.message
          : "Something went wrong. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function locate() {
    await action(async () => {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== "granted")
        throw new Error(
          "Location permission is required for nearby search. You can still browse all sellers.",
        );
      const result = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      setCoords({
        latitude: result.coords.latitude,
        longitude: result.coords.longitude,
      });
      const addresses = await Location.reverseGeocodeAsync(result.coords);
      if (addresses[0])
        setArea(
          addresses[0].city ||
            addresses[0].subregion ||
            addresses[0].region ||
            "",
        );
    });
  }
  async function publish() {
    await action(async () => {
      const p = Number(bulk ? wholesalePrice : price),
        w = Number(wholesalePrice),
        q = Number(quantity),
        min = bulk ? Number(minimum) : 1;
      if (
        !product.trim() ||
        !photo ||
        !Number.isFinite(p) ||
        p <= 0 ||
        !Number.isInteger(q) ||
        q < 1 ||
        q > 1_000_000 ||
        product.trim().length > 120 ||
        unit.trim().length > 30 ||
        !/^\d+(\.\d{1,2})?$/.test(bulk ? wholesalePrice : price) ||
        p > 9999999999.99 ||
        !Number.isInteger(min) ||
        min < 1 ||
        min > q ||
        !unit.trim()
      )
        throw new Error(
          "Add a photo, name, valid price, whole quantity, and minimum order within stock.",
        );
      if (
        (wholesale || bulk) &&
        (!Number.isFinite(w) ||
          w <= 0 ||
          w > 9999999999.99 ||
          !/^\d+(\.\d{1,2})?$/.test(wholesalePrice) ||
          !Number.isInteger(Number(minimum)) ||
          Number(minimum) < 1 ||
          Number(minimum) > q)
      )
        throw new Error(
          "Set a wholesale price and a minimum within your available stock.",
        );
      await API.checkServer();
      const image = await API.uploadPhoto(photo);
      await API.request("/listings", "POST", {
        name: product.trim(),
        price: p,
        quantity: q,
        unit,
        bulk,
        minimum: min,
        image: image.path,
        wholesale_price: wholesale || bulk ? w : null,
        wholesale_minimum: wholesale || bulk ? Number(minimum) : 1,
      });
      await refresh();
      setStep(0);
      setWholesale(false);
      setBulk(false);
      setWholesalePrice("");
      setProduct("");
      setPhoto("");
      setPrice("");
      setQuantity("");
      setTab("My farm");
    });
  }
  async function pick(camera: boolean) {
    await action(async () => {
      const permission = camera
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted)
        throw new Error("Please allow photo access in your device settings.");
      const result = camera
        ? await ImagePicker.launchCameraAsync({ quality: 0.7 })
        : await ImagePicker.launchImageLibraryAsync({
            quality: 0.7,
            mediaTypes: ["images"],
          });
      if (!result.canceled) setPhoto(result.assets[0].uri);
    });
  }
  const cartItems = Object.entries(state.cart)
    .map(([id, q]) => ({
      listing: state.listings.find((l) => l.id === id)!,
      quantity: q,
    }))
    .filter((i) => i.listing);
  const total = cartItems.reduce(
    (n, i) => n + i.quantity * unitPrice(i.listing, i.quantity),
    0,
  );
  function add(l: Listing) {
    const next = (state.cart[l.id] || 0) + (state.cart[l.id] ? 1 : l.minimum);
    if (next > l.quantity) {
      notify("There is not enough stock for this quantity.");
      return;
    }
    setState((v) => ({ ...v, cart: { ...v.cart, [l.id]: next } }));
  }
  async function checkout() {
    await action(async () => {
      if (!cartItems.length) return;
      await API.request("/orders", "POST", {
        requestKey: checkoutKey,
        items: cartItems.map((i) => ({
          listingId: i.listing.id,
          quantity: i.quantity,
        })),
        payment,
      });
      setState((v) => ({ ...v, cart: {} }));
      setCheckoutKey(uid());
      await refresh();
      setTab("History");
      notify(
        "Order requests sent and stock reserved. Agree collection and payment with your farmers.",
      );
    });
  }
  async function review() {
    await action(async () => {
      if (!selected || !comment.trim()) return;
      await API.request("/reviews", "POST", {
        farmerId: selected.farmerId,
        rating: stars,
        text: comment.trim(),
      });
      setComment("");
      await refresh();
    });
  }
  async function send() {
    await action(async () => {
      if (!profile || !chat || !message.trim()) return;
      if (!chatConnected)
        throw new Error("Live chat is disconnected. Reconnect and try again.");
      await F.send({
        id: uid(),
        senderId: profile.id,
        recipientId: chat.id,
        text: message.trim(),
        date: new Date().toISOString(),
      });
      setMessage("");
    });
  }
  async function updateStatus(id: string, status: Order["status"]) {
    await action(async () => {
      await API.request("/orders/" + id, "PATCH", { status });
      await refresh();
    });
  }
  async function clearSession() {
    currentAccount.current = undefined;
    await F.disconnect().catch(() => {});
    API.setToken(null);
    setState(emptyState);
    setSelected(null);
    setChat(null);
    setChatConnected(false);
    setContacts([]);
    setCoords(null);
    setMarketListings([]);
    setAnalytics({});
    setNotices([]);
    setReads({});
    setToast("");
    knownUpdates.current = { notices: null, messages: null };
    setProduct("");
    setPhoto("");
    setPrice("");
    setQuantity("");
    setUnit("kg");
    setWholesale(false);
    setWholesalePrice("");
    setBulk(false);
    setMinimum("10");
    setStep(0);
    setComment("");
    setStars(5);
    setMessage("");
    setPayment("Cash on collection");
    setSearch("");
    setNearby(false);
    setSort("Top rated");
    setArea("");
    setChatError("");
  }
  async function logout() {
    await action(async () => {
      try {
        await API.request("/auth/logout", "POST");
      } finally {
        await clearSession();
      }
    });
  }
  useEffect(() => {
    if (!profile) return;
    API.request<Record<string, string>>("/chat/reads")
      .then((values) => {
        if (currentAccount.current === profile.id)
          setReads((previous) => {
            const merged = { ...previous };
            for (const [id, date] of Object.entries(values)) {
              const normalized = new Date(date).toISOString();
              if (!merged[id] || normalized > merged[id])
                merged[id] = normalized;
            }
            return merged;
          });
      })
      .catch(() => {});
  }, [profile?.id]);
  useEffect(() => {
    if (!profile || !chat) return;
    const incoming = state.messages
      .filter((m) => m.senderId === chat.id && m.recipientId === profile.id)
      .sort((a, b) => b.date.localeCompare(a.date))[0];
    if (incoming && (!reads[chat.id] || incoming.date > reads[chat.id])) {
      setReads((v) => ({ ...v, [chat.id]: incoming.date }));
      API.request("/chat/reads/" + chat.id, "PATCH", {
        date: incoming.date,
      }).catch(() => {});
    }
  }, [chat?.id, state.messages, profile?.id]);
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(""), 5000);
      return () => clearTimeout(timer);
    }
  }, [toast]);
  if (!profile)
    return (
      <AuthScreen
        onAuthenticated={(result) => {
          API.setToken(result.token);
          setState({ ...emptyState, profile: result.profile });
          setTab(result.profile.role === "farmer" ? "My farm" : "Market");
          setCoords(null);
          setArea(result.profile.area);
        }}
      />
    );
  const farmer = profile.role === "farmer";
  const tabs = farmer
    ? ["My farm", "Add produce", "Analytics", "Messages", "Account"]
    : ["Market", "Cart", "History", "Messages", "Account"];
  const unread = state.messages.filter(
    (m) =>
      m.recipientId === profile.id &&
      (!reads[m.senderId] || m.date > reads[m.senderId]),
  );
  const badge = notices.filter((n) => !n.read).length + unread.length;
  const mine = state.listings.filter((l) => l.farmerId === profile.id);
  const pending = state.orders.filter(
    (o) => o.status === "Awaiting seller confirmation",
  );
  const openChat = (contact: { id: string; name: string }) => {
    setChat(contact);
    setSelected(null);
  };
  const heading = (eyebrow: string, title: string, description?: string) => (
    <View style={s.heading}>
      <Text style={s.kicker}>{eyebrow}</Text>
      <Text style={s.hero}>{title}</Text>
      {description ? <Text style={s.subtitle}>{description}</Text> : null}
    </View>
  );
  const empty = (icon: string, title: string, body: string) => (
    <View style={s.emptyCard}>
      <Text style={s.emptyIcon}>{icon}</Text>
      <Text style={s.productName}>{title}</Text>
      <Text style={s.empty}>{body}</Text>
    </View>
  );
  const priceInfo = (l: Listing) => (
    <>
      <Text style={s.price}>
        {money(l.price)} <Text style={s.muted}>/ {l.unit}</Text>
      </Text>
      {l.wholesalePrice != null && (
        <Text style={s.label}>
          {l.bulk
            ? "Wholesale only"
            : `Wholesale ${money(l.wholesalePrice)} / ${l.unit}`}{" "}
          · from {l.wholesaleMinimum || l.minimum} {l.unit}
        </Text>
      )}
    </>
  );
  const ordersView = (orders: Order[]) =>
    orders.map((o) => (
      <View key={o.id} style={s.card}>
        <View style={s.between}>
          <Text style={s.label}>ORDER #{o.id.slice(0, 8).toUpperCase()}</Text>
          <Text style={s.muted}>{new Date(o.date).toLocaleDateString()}</Text>
        </View>
        <View style={s.pill}>
          <Text style={s.label}>{o.status}</Text>
        </View>
        {o.items.map((i) => (
          <View key={i.listing.id} style={s.between}>
            <Text style={s.body}>
              {i.listing.name} × {i.quantity} {i.listing.unit}
            </Text>
            <Text style={s.label}>{money(i.quantity * i.listing.price)}</Text>
          </View>
        ))}
        <View style={s.divider} />
        <View style={s.between}>
          <Text style={s.muted}>{o.payment}</Text>
          <Text style={s.price}>{money(o.total)}</Text>
        </View>
        {farmer && o.status === "Awaiting seller confirmation" && (
          <Button
            title="Accept order"
            onPress={() => updateStatus(o.id, "Confirmed")}
          />
        )}
        {farmer && o.status === "Confirmed" && (
          <Button
            title="Mark collected & paid"
            onPress={() => updateStatus(o.id, "Completed")}
          />
        )}
        <View style={s.row}>
          <Button
            secondary
            title={farmer ? "Message buyer" : "Message farmer"}
            onPress={() =>
              openChat({
                id: farmer ? o.buyerId : o.items[0].listing.farmerId,
                name: farmer
                  ? o.buyerName || "Buyer"
                  : o.items[0].listing.seller,
              })
            }
          />
          {["Awaiting seller confirmation", "Confirmed"].includes(o.status) && (
            <Pressable onPress={() => updateStatus(o.id, "Cancelled")}>
              <Text style={s.link}>Cancel order</Text>
            </Pressable>
          )}
        </View>
      </View>
    ));
  const conversations = contacts
    .map((contact) => {
      const messages = state.messages
        .filter(
          (m) => m.senderId === contact.id || m.recipientId === contact.id,
        )
        .sort((a, b) => b.date.localeCompare(a.date));
      return {
        ...contact,
        latest: messages[0],
        count: unread.filter((m) => m.senderId === contact.id).length,
      };
    })
    .sort((a, b) => (b.latest?.date || "").localeCompare(a.latest?.date || ""));
  const chatMessages = chat
    ? state.messages
        .filter(
          (m) =>
            (m.senderId === profile.id && m.recipientId === chat.id) ||
            (m.senderId === chat.id && m.recipientId === profile.id),
        )
        .sort((a, b) => a.date.localeCompare(b.date))
    : [];
  return (
    <SafeAreaView style={s.safe}>
      <StatusBar style="dark" />
      <KeyboardAvoidingView
        style={s.container}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={s.header}>
          <View>
            <Text style={s.brand}>
              shamba<Text style={{ color: c.clay }}>market</Text>
            </Text>
            <Text style={s.muted}>
              {farmer
                ? "THE FARMER’S CORNER"
                : `YOUR LOCAL MARKET · ${profile.area}`}
            </Text>
          </View>
          <View style={s.row}>
            <Pressable
              accessibilityLabel={`Notifications, ${badge} unread`}
              onPress={() => {
                setTab("Notifications");
                setChat(null);
                setSelected(null);
              }}
              style={s.avatar}
            >
              <Icon name="bell" />
              {badge > 0 && (
                <View style={s.count}>
                  <Text style={s.countText}>{badge > 99 ? "99+" : badge}</Text>
                </View>
              )}
            </Pressable>
            <Pressable
              accessibilityLabel="Manage account"
              onPress={() => {
                setTab("Account");
                setSelected(null);
                setChat(null);
              }}
              style={s.avatar}
            >
              <Icon name="account" />
            </Pressable>
          </View>
        </View>
        {chatError !== "" && (
          <View style={s.banner}>
            <Text style={s.muted}>{chatError}</Text>
            <Pressable onPress={connectChat}>
              <Text style={s.link}>Reconnect chat</Text>
            </Pressable>
          </View>
        )}
        {toast !== "" && (
          <Pressable
            accessibilityRole="alert"
            onPress={() => {
              setToast("");
              setTab("Notifications");
              setChat(null);
              setSelected(null);
            }}
            style={s.toast}
          >
            <Text numberOfLines={2} style={{ color: c.paper, fontSize: 13 }}>
              {toast} · View →
            </Text>
          </Pressable>
        )}
        {chat ? (
          <>
            <View style={s.chatHeader}>
              <Pressable
                accessibilityLabel="Back to messages"
                onPress={() => {
                  setChat(null);
                  setTab("Messages");
                }}
              >
                <Text style={s.back}>‹</Text>
              </Pressable>
              <View style={s.avatar}>
                <Text style={s.label}>{chat.name[0]}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.productName}>{chat.name}</Text>
                <Text style={s.muted}>
                  {chatConnected
                    ? "Live chat · connected"
                    : "Connecting to chat…"}
                </Text>
              </View>
            </View>
            <ScrollView
              ref={chatScroll}
              contentContainerStyle={s.chatContent}
              onContentSizeChange={() =>
                chatScroll.current?.scrollToEnd({ animated: true })
              }
            >
              {!chatMessages.length &&
                empty(
                  "☏",
                  "Start a conversation",
                  "Ask about the harvest, collection or delivery.",
                )}
              {chatMessages.map((m, i) => (
                <React.Fragment key={m.id}>
                  {(i === 0 ||
                    new Date(chatMessages[i - 1].date).toDateString() !==
                      new Date(m.date).toDateString()) && (
                    <Text style={s.dateLabel}>
                      {new Date(m.date).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                      })}
                    </Text>
                  )}
                  <View
                    style={[s.bubble, m.senderId === profile.id && s.ownBubble]}
                  >
                    <Text
                      style={[
                        s.body,
                        m.senderId === profile.id && { color: c.paper },
                      ]}
                    >
                      {m.text}
                    </Text>
                    <Text
                      style={[
                        s.messageTime,
                        m.senderId === profile.id && { color: "#E7D5C3" },
                      ]}
                    >
                      {new Date(m.date).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </Text>
                  </View>
                </React.Fragment>
              ))}
            </ScrollView>
            <View style={s.composer}>
              <TextInput
                accessibilityLabel="Write a message"
                placeholder="Write a message…"
                placeholderTextColor={c.muted}
                value={message}
                onChangeText={setMessage}
                multiline
                maxLength={4000}
                style={s.composeInput}
              />
              <Pressable
                accessibilityLabel="Send message"
                disabled={busy || !message.trim()}
                style={s.send}
                onPress={send}
              >
                <Text style={{ color: c.paper, fontSize: 24 }}>↑</Text>
              </Pressable>
            </View>
          </>
        ) : (
          <ScrollView
            ref={contentScroll}
            contentContainerStyle={s.content}
            keyboardShouldPersistTaps="handled"
          >
            {selected ? (
              <>
                <Button
                  title="‹ Back to market"
                  secondary
                  onPress={() => setSelected(null)}
                />
                <Image source={{ uri: selected.image }} style={s.detailImage} />
                {heading(
                  selected.bulk ? "WHOLESALE HARVEST" : "FRESH FROM THE FARM",
                  selected.name,
                  `${selected.seller} · ${selected.area}`,
                )}
                <View style={s.card}>
                  {priceInfo(selected)}
                  <Text style={s.body}>
                    {selected.quantity} {selected.unit} available
                  </Text>
                  <Button title="Add to basket" onPress={() => add(selected)} />
                  <Button
                    title="Chat with farmer"
                    secondary
                    onPress={() =>
                      openChat({ id: selected.farmerId, name: selected.seller })
                    }
                  />
                  <Text style={s.muted}>
                    {selected.phone} · {selected.alternate}
                  </Text>
                </View>
                <Text style={s.title}>
                  From the community · ★{" "}
                  {rating(state, selected.farmerId).toFixed(1)}
                </Text>
                {state.reviews
                  .filter((r) => r.farmerId === selected.farmerId)
                  .map((r) => (
                    <View key={r.id} style={s.card}>
                      <Text style={s.label}>
                        {r.author} · {"★".repeat(r.rating)}
                      </Text>
                      <Text style={s.body}>{r.text}</Text>
                    </View>
                  ))}
                <View style={s.card}>
                  <Text style={s.productName}>How was your experience?</Text>
                  <View style={s.row}>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <Pressable
                        accessibilityLabel={`${n} stars`}
                        key={n}
                        onPress={() => setStars(n)}
                      >
                        <Text
                          style={{
                            fontSize: 32,
                            color: n <= stars ? c.clay : c.border,
                          }}
                        >
                          ★
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                  <Field
                    label="Share your experience"
                    value={comment}
                    onChangeText={setComment}
                  />
                  <Button title="Post review" onPress={review} />
                </View>
              </>
            ) : (
              <>
                {tab === "Market" && (
                  <>
                    {heading(
                      `GOOD FOOD STARTS HERE, ${profile.name.split(" ")[0].toUpperCase()}`,
                      "A little closer\nto the harvest.",
                      "Seasonal produce. Local growers. A fairer way to shop.",
                    )}
                    <View style={[s.feature, { padding: 20, gap: 8 }]}>
                      <Text style={s.featureKicker}>
                        FROM THEIR FARM TO YOUR TABLE
                      </Text>
                      <Text
                        style={[
                          s.featureTitle,
                          { fontSize: 25, lineHeight: 30 },
                        ]}
                      >
                        Picked locally. Priced fairly.
                      </Text>
                    </View>
                    <TextInput
                      accessibilityLabel="Search produce, farmers, or area"
                      placeholder="⌕  Search produce, farmers or area"
                      placeholderTextColor={c.muted}
                      value={search}
                      onChangeText={setSearch}
                      style={s.input}
                    />
                    <View style={s.between}>
                      <View>
                        <Text style={s.label}>Shop close to home</Text>
                        <Pressable onPress={locate}>
                          <Text style={s.muted}>
                            {coords
                              ? `Within 30 km · ${area}`
                              : "Use my current location ↗"}
                          </Text>
                        </Pressable>
                      </View>
                      <Switch
                        value={nearby}
                        onValueChange={setNearby}
                        trackColor={{ false: c.border, true: c.clay }}
                        thumbColor={c.paper}
                      />
                    </View>
                    <View style={s.between}>
                      <Text style={s.title}>Fresh at the market</Text>
                      <Text style={s.muted}>{marketListings.length} finds</Text>
                    </View>
                    <View style={s.row}>
                      {["Top rated", "Popular"].map((v) => (
                        <Pressable
                          key={v}
                          style={[s.chip, sort === v && s.chipActive]}
                          onPress={() => setSort(v)}
                        >
                          <Text
                            style={[s.label, sort === v && { color: c.paper }]}
                          >
                            {v === "Top rated" ? "★ " : "↗ "}
                            {v}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                    <View style={s.grid}>
                      {marketListings.map((l) => (
                        <Pressable
                          key={l.id}
                          accessibilityRole="button"
                          onPress={() => setSelected(l)}
                          style={s.product}
                        >
                          <Image
                            source={{ uri: l.image }}
                            style={s.productImage}
                          />
                          <View style={s.productInfo}>
                            <Text style={s.kicker}>
                              {l.bulk ? "WHOLESALE ONLY" : "FARM FRESH"}
                            </Text>
                            <Text style={s.productName}>{l.name}</Text>
                            <Text style={s.muted}>
                              {l.seller} · {l.area}
                              {l.distanceKm != null
                                ? ` · ${l.distanceKm} km`
                                : ""}
                            </Text>
                            {priceInfo(l)}
                            <View style={s.between}>
                              <Text style={s.muted}>
                                ★ {(l.rating || 0).toFixed(1)}
                              </Text>
                              <Text style={s.muted}>
                                {l.quantity} {l.unit} left
                              </Text>
                            </View>
                          </View>
                        </Pressable>
                      ))}
                    </View>
                    {!marketListings.length &&
                      empty(
                        "⌕",
                        "No harvests found",
                        "Try another search or browse beyond your area.",
                      )}
                  </>
                )}
                {tab === "My farm" && (
                  <>
                    {heading(
                      `WELCOME BACK, ${profile.name.split(" ")[0].toUpperCase()}`,
                      "Good things\nare growing.",
                      `${profile.area} · Your farm at a glance`,
                    )}
                    <View style={s.stats}>
                      <View style={s.stat}>
                        <Text style={s.muted}>Sales · KSh</Text>
                        <Text style={s.statValue}>
                          {(analytics.Completed?.value || 0).toLocaleString()}
                        </Text>
                      </View>
                      <View style={s.stat}>
                        <Text style={s.muted}>New requests</Text>
                        <Text style={s.statValue}>{pending.length}</Text>
                      </View>
                    </View>
                    <View style={s.feature}>
                      <Text style={s.featureKicker}>
                        YOUR NEXT HARVEST STARTS HERE
                      </Text>
                      <Text style={s.featureTitle}>
                        {"Your next harvest,\nready for the market."}
                      </Text>
                      <Button
                        title="+ List your produce"
                        onPress={() => setTab("Add produce")}
                      />
                    </View>
                    {pending.length > 0 && (
                      <>
                        <View style={s.between}>
                          <Text style={s.title}>Needs your attention</Text>
                          <Pressable onPress={() => setTab("Analytics")}>
                            <Text style={s.link}>All orders →</Text>
                          </Pressable>
                        </View>
                        {ordersView(pending.slice(0, 2))}
                      </>
                    )}
                    <View style={s.between}>
                      <Text style={s.title}>Your farm stand</Text>
                      <Text style={s.muted}>{mine.length} listings</Text>
                    </View>
                    {mine.map((l) => (
                      <View key={l.id} style={s.inventory}>
                        <Image source={{ uri: l.image }} style={s.thumb} />
                        <View style={{ flex: 1, gap: 5 }}>
                          <Text style={s.productName}>{l.name}</Text>
                          {priceInfo(l)}
                          <Text style={s.muted}>
                            {l.quantity > 0
                              ? `${l.quantity} ${l.unit} in stock`
                              : "Sold out"}
                          </Text>
                        </View>
                      </View>
                    ))}
                    {!mine.length &&
                      empty(
                        "✦",
                        "Make room for your first harvest",
                        "Add a photo, choose your prices and start reaching buyers.",
                      )}
                  </>
                )}
                {tab === "Add produce" && (
                  <>
                    {heading(
                      "FROM YOUR FARM, WITH CARE",
                      "List a fresh harvest.",
                      "A few simple steps to help your produce stand out.",
                    )}
                    <View style={s.steps}>
                      {["Photo", "Details", "Pricing", "Review"].map(
                        (label, i) => (
                          <Pressable
                            key={label}
                            onPress={() => i < step && setStep(i)}
                            style={s.step}
                          >
                            <View
                              style={[
                                s.stepDot,
                                i <= step && { backgroundColor: c.brown },
                              ]}
                            >
                              <Text
                                style={{
                                  color: i <= step ? c.paper : c.muted,
                                  fontWeight: "700",
                                }}
                              >
                                {i < step ? "✓" : i + 1}
                              </Text>
                            </View>
                            <Text style={s.muted}>{label}</Text>
                          </Pressable>
                        ),
                      )}
                    </View>
                    <View style={s.card}>
                      <Text style={s.kicker}>STEP {step + 1} OF 4</Text>
                      <Text style={s.title}>
                        {
                          [
                            "Show off your produce",
                            "Tell us about your harvest",
                            "Your harvest, your prices",
                            "Ready for the market?",
                          ][step]
                        }
                      </Text>
                      {step === 0 && (
                        <>
                          <Text style={s.subtitle}>
                            Use a clear photo in natural light. Let buyers see
                            what they’re getting.
                          </Text>
                          {photo ? (
                            <Image
                              source={{ uri: photo }}
                              style={s.detailImage}
                            />
                          ) : (
                            <View style={s.photoPlaceholder}>
                              <Text style={s.emptyIcon}>▧</Text>
                              <Text style={s.productName}>
                                Your produce takes centre stage
                              </Text>
                              <Text style={s.muted}>
                                One great photo is all you need.
                              </Text>
                            </View>
                          )}
                          <Button
                            title="Take a photo"
                            onPress={() => pick(true)}
                          />
                          <Button
                            title={
                              photo
                                ? "Choose a different photo"
                                : "Choose from gallery"
                            }
                            secondary
                            onPress={() => pick(false)}
                          />
                        </>
                      )}
                      {step === 1 && (
                        <>
                          <Field
                            label="What are you selling?"
                            value={product}
                            onChangeText={setProduct}
                          />
                          <Text style={s.muted}>
                            For example: fresh tomatoes or ripe Hass avocados.
                          </Text>
                          <Field
                            label="Quantity available"
                            value={quantity}
                            onChangeText={setQuantity}
                            numeric
                          />
                          <Text style={s.label}>Sold by the</Text>
                          <View style={s.row}>
                            {["kg", "crate", "bunch", "bag", "piece"].map(
                              (u) => (
                                <Pressable
                                  key={u}
                                  onPress={() => setUnit(u)}
                                  style={[s.chip, unit === u && s.chipActive]}
                                >
                                  <Text
                                    style={[
                                      s.label,
                                      unit === u && { color: c.paper },
                                    ]}
                                  >
                                    {u}
                                  </Text>
                                </Pressable>
                              ),
                            )}
                          </View>
                          <Field
                            label="Unit (or enter your own)"
                            value={unit}
                            onChangeText={setUnit}
                          />
                        </>
                      )}
                      {step === 2 && (
                        <>
                          <Text style={s.subtitle}>
                            Choose who you sell to. Wholesale pricing applies
                            automatically when buyers reach your minimum.
                          </Text>
                          {[
                            {
                              label: "Retail only",
                              detail: "Everyday quantities, one simple price.",
                              w: false,
                              b: false,
                            },
                            {
                              label: "Retail + wholesale",
                              detail:
                                "Offer a separate price for larger orders.",
                              w: true,
                              b: false,
                            },
                            {
                              label: "Wholesale only",
                              detail: "Only accept orders above your minimum.",
                              w: true,
                              b: true,
                            },
                          ].map((mode) => (
                            <Pressable
                              key={mode.label}
                              style={[
                                s.choice,
                                wholesale === mode.w &&
                                  bulk === mode.b &&
                                  s.choiceSelected,
                              ]}
                              onPress={() => {
                                setWholesale(mode.w);
                                setBulk(mode.b);
                              }}
                            >
                              <Text style={s.productName}>
                                {wholesale === mode.w && bulk === mode.b
                                  ? "● "
                                  : "○ "}
                                {mode.label}
                              </Text>
                              <Text style={s.muted}>{mode.detail}</Text>
                            </Pressable>
                          ))}
                          {!bulk && (
                            <Field
                              label={`Retail price per ${unit} (KSh)`}
                              value={price}
                              onChangeText={setPrice}
                              numeric
                            />
                          )}
                          {wholesale && (
                            <>
                              <Field
                                label={`Wholesale price per ${unit} (KSh)`}
                                value={wholesalePrice}
                                onChangeText={setWholesalePrice}
                                numeric
                              />
                              <Field
                                label={`Wholesale minimum (${unit})`}
                                value={minimum}
                                onChangeText={setMinimum}
                                numeric
                              />
                              <View style={s.note}>
                                <Text style={s.label}>
                                  Wholesale starts at {minimum || "…"} {unit}
                                </Text>
                                <Text style={s.muted}>
                                  Each {unit} costs{" "}
                                  {money(Number(wholesalePrice) || 0)} once the
                                  minimum is reached.
                                </Text>
                              </View>
                            </>
                          )}
                        </>
                      )}
                      {step === 3 && (
                        <>
                          <Image
                            source={{ uri: photo }}
                            style={s.detailImage}
                          />
                          <Text style={s.productName}>{product}</Text>
                          <Text style={s.subtitle}>
                            {quantity} {unit} available · {profile.area}
                          </Text>
                          {!bulk && (
                            <Text style={s.price}>
                              Retail {money(Number(price))} / {unit}
                            </Text>
                          )}
                          {wholesale && (
                            <View style={s.note}>
                              <Text style={s.price}>
                                Wholesale {money(Number(wholesalePrice))} /{" "}
                                {unit}
                              </Text>
                              <Text style={s.muted}>
                                {bulk
                                  ? "Wholesale only"
                                  : "Retail and wholesale"}{" "}
                                · minimum {minimum} {unit}
                              </Text>
                            </View>
                          )}
                          <Text style={s.muted}>
                            Buyers can contact you to agree payment and
                            collection.
                          </Text>
                        </>
                      )}
                      <View style={s.divider} />
                      <View style={s.row}>
                        {step > 0 && (
                          <Button
                            title="Back"
                            secondary
                            onPress={() => setStep((v) => v - 1)}
                          />
                        )}
                        <View style={{ flex: 1 }}>
                          <Button
                            title={
                              step === 3
                                ? busy
                                  ? "Publishing…"
                                  : "Publish produce"
                                : "Continue →"
                            }
                            onPress={() => {
                              if (step === 0 && !photo)
                                return notify(
                                  "Choose or take a produce photo first.",
                                );
                              if (
                                step === 1 &&
                                (!product.trim() ||
                                  !unit.trim() ||
                                  !Number.isInteger(Number(quantity)) ||
                                  Number(quantity) < 1)
                              )
                                return notify(
                                  "Add a produce name, unit and whole quantity.",
                                );
                              if (
                                step === 2 &&
                                ((!bulk && !(Number(price) > 0)) ||
                                  (wholesale &&
                                    (!(Number(wholesalePrice) > 0) ||
                                      !Number.isInteger(Number(minimum)) ||
                                      Number(minimum) < 1 ||
                                      Number(minimum) > Number(quantity))))
                              )
                                return notify(
                                  "Check your prices and wholesale minimum.",
                                );
                              step < 3 ? setStep((v) => v + 1) : publish();
                            }}
                          />
                        </View>
                      </View>
                    </View>
                  </>
                )}
                {tab === "Cart" && (
                  <>
                    {heading(
                      "YOUR MARKET BASKET",
                      "Good choices,\nfresh beginnings.",
                      `${cartItems.length} fresh finds ready for your table`,
                    )}
                    {!cartItems.length ? (
                      <>
                        {empty(
                          "♧",
                          "Your basket is waiting",
                          "Find something fresh from a local farmer.",
                        )}
                        <Button
                          title="Explore the market"
                          onPress={() => setTab("Market")}
                        />
                      </>
                    ) : (
                      <>
                        {cartItems.map((i) => (
                          <View key={i.listing.id} style={s.card}>
                            <View style={s.inventoryRow}>
                              <Image
                                source={{ uri: i.listing.image }}
                                style={s.thumb}
                              />
                              <View style={{ flex: 1, gap: 5 }}>
                                <Text style={s.productName}>
                                  {i.listing.name}
                                </Text>
                                <Text style={s.muted}>{i.listing.seller}</Text>
                                <Text style={s.label}>
                                  {money(unitPrice(i.listing, i.quantity))} /{" "}
                                  {i.listing.unit}
                                </Text>
                              </View>
                            </View>
                            {i.listing.wholesalePrice != null && (
                              <Text style={s.muted}>
                                {i.quantity >= (i.listing.wholesaleMinimum || 1)
                                  ? "✓ Wholesale price applied"
                                  : `Wholesale price from ${i.listing.wholesaleMinimum} ${i.listing.unit}`}
                              </Text>
                            )}
                            {i.listing.wholesalePrice != null &&
                              i.quantity < (i.listing.wholesaleMinimum || 1) &&
                              i.listing.quantity >=
                                (i.listing.wholesaleMinimum || 1) && (
                                <Button
                                  secondary
                                  title={`Order wholesale · ${i.listing.wholesaleMinimum} ${i.listing.unit}`}
                                  onPress={() =>
                                    setState((v) => ({
                                      ...v,
                                      cart: {
                                        ...v.cart,
                                        [i.listing.id]:
                                          i.listing.wholesaleMinimum || 1,
                                      },
                                    }))
                                  }
                                />
                              )}
                            <View style={s.between}>
                              <View style={s.row}>
                                <Button
                                  title="−"
                                  secondary
                                  onPress={() =>
                                    setState((v) => {
                                      const cart = { ...v.cart };
                                      if (
                                        cart[i.listing.id] <= i.listing.minimum
                                      )
                                        delete cart[i.listing.id];
                                      else cart[i.listing.id]--;
                                      return { ...v, cart };
                                    })
                                  }
                                />
                                <Text style={s.label}>
                                  {i.quantity} {i.listing.unit}
                                </Text>
                                <Button
                                  title="+"
                                  secondary
                                  onPress={() => add(i.listing)}
                                />
                              </View>
                              <Text style={s.price}>
                                {money(
                                  i.quantity * unitPrice(i.listing, i.quantity),
                                )}
                              </Text>
                            </View>
                          </View>
                        ))}
                        <View style={s.card}>
                          <Text style={s.title}>Payment & collection</Text>
                          <Text style={s.muted}>
                            Choose a preference, then agree the details with
                            your farmer.
                          </Text>
                          {[
                            "Cash on collection",
                            "Cash on delivery",
                            "Bank transfer arranged with seller",
                          ].map((p) => (
                            <Pressable
                              key={p}
                              style={[
                                s.choice,
                                payment === p && s.choiceSelected,
                              ]}
                              onPress={() => setPayment(p)}
                            >
                              <Text style={s.label}>
                                {payment === p ? "● " : "○ "}
                                {p}
                              </Text>
                            </Pressable>
                          ))}
                          <View style={s.divider} />
                          <View style={s.between}>
                            <Text style={s.productName}>Basket total</Text>
                            <Text style={s.statValue}>{money(total)}</Text>
                          </View>
                          <Button
                            title="Send order request →"
                            onPress={checkout}
                          />
                          <Text style={s.muted}>
                            No payment is collected in the app. Your stock is
                            reserved when you send the request.
                          </Text>
                        </View>
                      </>
                    )}
                  </>
                )}
                {tab === "History" && (
                  <>
                    {heading(
                      "FROM FARM TO TABLE",
                      "Your purchases.",
                      "Track your requests and revisit your favourite harvests.",
                    )}
                    {ordersView(state.orders)}
                    {!state.orders.length &&
                      empty(
                        "▤",
                        "Your story starts with a harvest",
                        "Your order requests will appear here.",
                      )}
                  </>
                )}
                {tab === "Analytics" && (
                  <>
                    {heading(
                      "THE BIGGER PICTURE",
                      "Your farm in numbers.",
                      "Keep an eye on your harvest, orders and completed sales.",
                    )}
                    <View style={s.feature}>
                      <Text style={s.featureKicker}>COMPLETED SALES</Text>
                      <Text style={s.featureTitle}>
                        {money(analytics.Completed?.value || 0)}
                      </Text>
                      <Text style={s.featureBody}>
                        Orders marked collected and paid.
                      </Text>
                    </View>
                    <View style={s.stats}>
                      <View style={s.stat}>
                        <Text style={s.muted}>Total orders</Text>
                        <Text style={s.statValue}>
                          {analytics.summary?.orderCount || 0}
                        </Text>
                      </View>
                      <View style={s.stat}>
                        <Text style={s.muted}>Farmer rating</Text>
                        <Text style={s.statValue}>
                          ★ {(analytics.summary?.rating || 0).toFixed(1)}
                        </Text>
                      </View>
                    </View>
                    <View style={s.card}>
                      <Text style={s.productName}>Order overview</Text>
                      {[
                        "Awaiting seller confirmation",
                        "Confirmed",
                        "Completed",
                        "Cancelled",
                      ].map((status) => (
                        <View key={status} style={{ gap: 6 }}>
                          <View style={s.between}>
                            <Text style={s.muted}>{status}</Text>
                            <Text style={s.label}>
                              {
                                state.orders.filter((o) => o.status === status)
                                  .length
                              }
                            </Text>
                          </View>
                          <View style={s.bar}>
                            <View
                              style={[
                                s.barFill,
                                {
                                  width: `${state.orders.length ? (state.orders.filter((o) => o.status === status).length / state.orders.length) * 100 : 0}%`,
                                },
                              ]}
                            />
                          </View>
                        </View>
                      ))}
                    </View>
                    <Text style={s.title}>Manage your orders</Text>
                    {ordersView(state.orders)}
                    {!state.orders.length &&
                      empty(
                        "▥",
                        "A fresh start",
                        "New orders and sales will appear here.",
                      )}
                  </>
                )}
                {tab === "Messages" && (
                  <>
                    {heading(
                      "A GOOD CONVERSATION GOES A LONG WAY",
                      "Your conversations.",
                      "Talk harvests, collection and everything in between.",
                    )}
                    <View style={s.pill}>
                      <Text style={s.label}>
                        {chatConnected
                          ? "● Live chat connected"
                          : "○ Chat disconnected"}
                      </Text>
                    </View>
                    {conversations.map((contact) => (
                      <Pressable
                        key={contact.id}
                        style={s.conversation}
                        onPress={() => openChat(contact)}
                      >
                        <View style={s.contactAvatar}>
                          <Text style={s.avatarLetter}>
                            {contact.name[0].toUpperCase()}
                          </Text>
                        </View>
                        <View style={{ flex: 1, gap: 6 }}>
                          <View style={s.between}>
                            <Text style={s.productName}>{contact.name}</Text>
                            <Text style={s.muted}>
                              {contact.latest
                                ? new Date(
                                    contact.latest.date,
                                  ).toLocaleDateString(undefined, {
                                    month: "short",
                                    day: "numeric",
                                  })
                                : ""}
                            </Text>
                          </View>
                          <Text numberOfLines={1} style={s.muted}>
                            {contact.latest
                              ? `${contact.latest.senderId === profile.id ? "You: " : ""}${contact.latest.text}`
                              : "Start a conversation"}
                          </Text>
                        </View>
                        {contact.count > 0 && (
                          <View style={s.unread}>
                            <Text style={s.countText}>{contact.count}</Text>
                          </View>
                        )}
                      </Pressable>
                    ))}
                    {!conversations.length &&
                      empty(
                        "☏",
                        "Say hello to your community",
                        farmer
                          ? "Open an order to chat with a buyer."
                          : "Open a farmer’s listing to start chatting.",
                      )}
                  </>
                )}
                {tab === "Account" && (
                  <AccountScreen
                    profile={profile}
                    onUpdated={(updated) => {
                      setState((v) => ({ ...v, profile: updated }));
                      setArea(updated.area);
                      setCoords(null);
                      refresh().catch(() => {});
                    }}
                    onDeleted={clearSession}
                    onLogout={logout}
                    onScrollToTop={() =>
                      contentScroll.current?.scrollTo({ y: 0, animated: false })
                    }
                  />
                )}
                {tab === "Notifications" && (
                  <>
                    {heading(
                      "YOUR MARKET UPDATES",
                      "You’re in the loop.",
                      "New messages, order requests and updates in one place.",
                    )}
                    {unread.map((m) => (
                      <Pressable
                        key={m.id}
                        style={s.card}
                        onPress={() =>
                          openChat({
                            id: m.senderId,
                            name:
                              contacts.find((x) => x.id === m.senderId)?.name ||
                              "Market member",
                          })
                        }
                      >
                        <Text style={s.kicker}>NEW MESSAGE</Text>
                        <Text style={s.productName}>
                          {contacts.find((x) => x.id === m.senderId)?.name ||
                            "Market member"}
                        </Text>
                        <Text style={s.body}>{m.text}</Text>
                        <Text style={s.muted}>
                          {new Date(m.date).toLocaleString()}
                        </Text>
                      </Pressable>
                    ))}
                    {notices.map((n) => (
                      <Pressable
                        key={n.id}
                        style={[s.card, !n.read && s.choiceSelected]}
                        onPress={() =>
                          action(async () => {
                            await API.request(
                              "/notifications/" + n.id + "/read",
                              "PATCH",
                            );
                            setNotices((v) =>
                              v.map((x) =>
                                x.id === n.id ? { ...x, read: true } : x,
                              ),
                            );
                            setTab(farmer ? "Analytics" : "History");
                          })
                        }
                      >
                        <View style={s.between}>
                          <Text style={s.productName}>{n.title}</Text>
                          {!n.read && <Text style={s.link}>●</Text>}
                        </View>
                        <Text style={s.body}>{n.body}</Text>
                        <Text style={s.muted}>
                          {new Date(n.date).toLocaleString()} · View order →
                        </Text>
                      </Pressable>
                    ))}
                    {!notices.length &&
                      !unread.length &&
                      empty(
                        "✦",
                        "All quiet at the market",
                        "Your messages and order updates will appear here.",
                      )}
                  </>
                )}
              </>
            )}
            {busy && <ActivityIndicator color={c.brown} />}
          </ScrollView>
        )}
        {!selected && !chat && (
          <View style={s.nav}>
            {tabs.map((t, i) => (
              <Pressable
                key={t}
                accessibilityRole="tab"
                accessibilityLabel={t}
                accessibilityState={{ selected: tab === t }}
                onPress={() => setTab(t)}
                style={s.navItem}
              >
                <View style={[s.navIcon, tab === t && s.navIconActive]}>
                  <Icon
                    name={
                      (farmer
                        ? ["home", "plus", "chart", "message", "account"]
                        : ["home", "cart", "history", "message", "account"])[
                        i
                      ] as IconName
                    }
                    color={tab === t ? c.paper : c.muted}
                  />
                  {((t === "Messages" && unread.length > 0) ||
                    (t === "Cart" && cartItems.length > 0)) && (
                    <View style={s.count}>
                      <Text style={s.countText}>
                        {t === "Messages" ? unread.length : cartItems.length}
                      </Text>
                    </View>
                  )}
                </View>
                <Text style={[s.navText, tab === t && s.active]}>{t}</Text>
              </Pressable>
            ))}
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
const s = StyleSheet.create({
  toast: {
    backgroundColor: c.brown,
    paddingHorizontal: 22,
    paddingVertical: 12,
  },
  safe: { flex: 1, backgroundColor: c.background },
  container: { flex: 1, width: "100%", maxWidth: 1050, alignSelf: "center" },
  header: {
    paddingHorizontal: 22,
    paddingVertical: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderColor: c.border,
    gap: 10,
  },
  brand: { fontSize: 26, fontWeight: "800", color: c.brown, letterSpacing: -1 },
  muted: { fontSize: 12, lineHeight: 19, color: c.muted },
  body: { fontSize: 15, lineHeight: 23, color: c.ink },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap",
  },
  between: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    flexWrap: "wrap",
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: c.soft,
    alignItems: "center",
    justifyContent: "center",
  },
  bell: { fontSize: 26, color: c.brown },
  count: {
    position: "absolute",
    top: -4,
    right: -4,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: 9,
    backgroundColor: c.clay,
    alignItems: "center",
    justifyContent: "center",
  },
  countText: { fontSize: 10, fontWeight: "800", color: c.paper },
  content: { padding: 22, gap: 20, paddingBottom: 40 },
  heading: { gap: 10, paddingVertical: 8 },
  kicker: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.7,
    color: c.clay,
  },
  hero: {
    fontFamily: Platform.OS === "ios" ? "Georgia" : "serif",
    fontSize: 39,
    lineHeight: 44,
    letterSpacing: -1.4,
    color: c.ink,
  },
  subtitle: { fontSize: 15, lineHeight: 24, color: c.muted },
  title: { fontSize: 22, fontWeight: "700", color: c.ink },
  productName: { fontSize: 17, fontWeight: "700", color: c.ink },
  price: { fontSize: 19, fontWeight: "700", color: c.brown },
  label: { fontSize: 13, fontWeight: "600", color: c.brown, lineHeight: 20 },
  link: { fontSize: 13, fontWeight: "700", color: c.brown },
  feature: {
    padding: 26,
    borderRadius: 24,
    backgroundColor: c.brownDark,
    gap: 16,
  },
  featureKicker: {
    color: "#DFC1A2",
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.4,
  },
  featureTitle: {
    fontFamily: Platform.OS === "ios" ? "Georgia" : "serif",
    fontSize: 30,
    lineHeight: 37,
    color: c.cream,
  },
  featureBody: { color: "#E7D5C3", fontSize: 14, lineHeight: 22 },
  input: {
    backgroundColor: c.paper,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 14,
    padding: 16,
    fontSize: 15,
    color: c.ink,
    minHeight: 54,
  },
  button: {
    backgroundColor: c.brown,
    paddingVertical: 15,
    paddingHorizontal: 18,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 49,
  },
  secondary: { backgroundColor: c.soft },
  buttonText: { fontSize: 14, fontWeight: "700", color: c.paper },
  chip: {
    paddingHorizontal: 17,
    paddingVertical: 10,
    backgroundColor: c.soft,
    borderRadius: 24,
  },
  chipActive: { backgroundColor: c.brown },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 14 },
  product: {
    width: "46%",
    minWidth: 140,
    flexGrow: 1,
    maxWidth: 480,
    borderRadius: 20,
    overflow: "hidden",
    backgroundColor: c.paper,
    borderWidth: 1,
    borderColor: c.border,
  },
  productImage: { height: 170, width: "100%", backgroundColor: c.soft },
  productInfo: { padding: 14, gap: 8 },
  card: {
    padding: 20,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.paper,
    gap: 15,
  },
  emptyCard: {
    alignItems: "center",
    gap: 12,
    padding: 30,
    borderRadius: 22,
    backgroundColor: c.soft,
  },
  emptyIcon: { fontSize: 40, color: c.clay },
  empty: { textAlign: "center", fontSize: 14, lineHeight: 23, color: c.muted },
  pill: {
    alignSelf: "flex-start",
    backgroundColor: c.soft,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 12,
  },
  divider: { height: 1, backgroundColor: c.border },
  stats: { flexDirection: "row", gap: 12, flexWrap: "wrap" },
  stat: {
    flex: 1,
    minWidth: 130,
    backgroundColor: c.paper,
    padding: 20,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 20,
    gap: 8,
  },
  statValue: {
    fontSize: 22,
    fontWeight: "700",
    color: c.brown,
    letterSpacing: -0.5,
  },
  inventory: {
    flexDirection: "row",
    gap: 15,
    padding: 15,
    borderRadius: 20,
    backgroundColor: c.paper,
    borderWidth: 1,
    borderColor: c.border,
    alignItems: "center",
  },
  inventoryRow: { flexDirection: "row", gap: 15, alignItems: "center" },
  thumb: { width: 76, height: 86, borderRadius: 13, backgroundColor: c.soft },
  detailImage: {
    height: 250,
    width: "100%",
    borderRadius: 18,
    backgroundColor: c.soft,
  },
  steps: { flexDirection: "row", justifyContent: "space-between" },
  step: { alignItems: "center", gap: 8, flex: 1 },
  stepDot: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: c.soft,
    alignItems: "center",
    justifyContent: "center",
  },
  photoPlaceholder: {
    height: 230,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: c.clay,
    borderRadius: 18,
    backgroundColor: c.cream,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    padding: 15,
  },
  choice: {
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 14,
    padding: 16,
    gap: 6,
  },
  choiceSelected: { borderColor: c.clay, backgroundColor: c.cream },
  note: { padding: 16, gap: 8, borderRadius: 14, backgroundColor: c.cream },
  bar: {
    height: 6,
    borderRadius: 3,
    backgroundColor: c.soft,
    overflow: "hidden",
  },
  barFill: { height: 6, backgroundColor: c.clay },
  conversation: {
    paddingVertical: 18,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderBottomWidth: 1,
    borderColor: c.border,
  },
  contactAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: c.soft,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarLetter: { fontSize: 20, fontWeight: "700", color: c.brown },
  unread: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    paddingHorizontal: 6,
    backgroundColor: c.brown,
    alignItems: "center",
    justifyContent: "center",
  },
  nav: {
    flexDirection: "row",
    backgroundColor: c.paper,
    paddingTop: 10,
    paddingBottom: 12,
    borderTopWidth: 1,
    borderColor: c.border,
  },
  navItem: { flex: 1, alignItems: "center", gap: 5 },
  navIcon: {
    width: 48,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  navIconActive: { backgroundColor: c.brown },
  navSymbol: { fontSize: 24, color: c.muted },
  navText: { fontSize: 11, color: c.muted },
  active: { color: c.brown, fontWeight: "800" },
  banner: { padding: 12, backgroundColor: c.cream, gap: 6 },
  chatHeader: {
    padding: 18,
    flexDirection: "row",
    gap: 12,
    alignItems: "center",
    borderBottomWidth: 1,
    borderColor: c.border,
  },
  back: { fontSize: 35, color: c.brown },
  chatContent: { padding: 20, gap: 12, flexGrow: 1 },
  dateLabel: { alignSelf: "center", fontSize: 11, color: c.muted, padding: 8 },
  bubble: {
    alignSelf: "flex-start",
    maxWidth: "85%",
    padding: 14,
    borderRadius: 18,
    borderBottomLeftRadius: 4,
    backgroundColor: c.paper,
    borderWidth: 1,
    borderColor: c.border,
    gap: 6,
  },
  ownBubble: {
    alignSelf: "flex-end",
    backgroundColor: c.brown,
    borderColor: c.brown,
    borderBottomLeftRadius: 18,
    borderBottomRightRadius: 4,
  },
  messageTime: { fontSize: 10, color: c.muted, alignSelf: "flex-end" },
  composer: {
    padding: 14,
    backgroundColor: c.paper,
    borderTopWidth: 1,
    borderColor: c.border,
    flexDirection: "row",
    gap: 10,
    alignItems: "flex-end",
  },
  composeInput: {
    flex: 1,
    maxHeight: 120,
    minHeight: 48,
    padding: 13,
    borderRadius: 22,
    backgroundColor: c.background,
    color: c.ink,
    fontSize: 15,
  },
  send: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: c.brown,
    alignItems: "center",
    justifyContent: "center",
  },
});
