import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import * as Location from "expo-location";
import * as API from "../api";
import { Profile } from "../model";
import { colors as c } from "../theme";

type Props = {
  profile: Profile;
  onUpdated: (profile: Profile) => void;
  onDeleted: () => Promise<void>;
  onLogout: () => void;
  onScrollToTop: () => void;
};
function Field({
  label,
  value,
  onChange,
  secure = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  secure?: boolean;
}) {
  return (
    <View style={{ gap: 7 }}>
      <Text style={s.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        value={value}
        onChangeText={onChange}
        secureTextEntry={secure}
        autoCapitalize="none"
        autoCorrect={false}
        style={s.input}
      />
    </View>
  );
}
function Button({
  title,
  onPress,
  disabled = false,
  danger = false,
  secondary = false,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  danger?: boolean;
  secondary?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[
        s.button,
        secondary && s.secondary,
        danger && { backgroundColor: c.error },
        disabled && { opacity: 0.45 },
      ]}
    >
      <Text
        style={{
          color: secondary ? c.brown : c.paper,
          fontWeight: "700",
          textAlign: "center",
        }}
      >
        {title}
      </Text>
    </Pressable>
  );
}
export default function AccountScreen({
  profile,
  onUpdated,
  onDeleted,
  onLogout,
  onScrollToTop,
}: Props) {
  const [page, setPage] = useState("Details");
  const [draft, setDraft] = useState({
    name: profile.name,
    phone: profile.phone,
    alternate: profile.alternate,
    area: profile.area,
    produce: profile.produce,
  });
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [success, setSuccess] = useState("");
  const [currentPassword, setCurrentPassword] = useState(""),
    [newPassword, setNewPassword] = useState(""),
    [confirmPassword, setConfirmPassword] = useState("");
  const [deletePassword, setDeletePassword] = useState(""),
    [confirmation, setConfirmation] = useState("");
  const [coords, setCoords] = useState<{
      latitude: number;
      longitude: number;
    } | null>(null),
    [locationArea, setLocationArea] = useState(profile.area),
    [consent, setConsent] = useState(false);
  const farmer = profile.role === "farmer";
  useEffect(() => {
    setDraft({
      name: profile.name,
      phone: profile.phone,
      alternate: profile.alternate,
      area: profile.area,
      produce: profile.produce,
    });
    setLocationArea(profile.area);
  }, [profile]);
  const change = (key: keyof typeof draft) => (value: string) =>
    setDraft((v) => ({ ...v, [key]: value }));
  async function run(fn: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Please try again.");
    } finally {
      setBusy(false);
      onScrollToTop();
    }
  }
  function navigate(next: string) {
    onScrollToTop();
    setPage(next);
    setError("");
    setSuccess("");
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setDeletePassword("");
    setConfirmation("");
  }
  async function saveDetails() {
    await run(async () => {
      const result = await API.request<Profile>("/me", "PATCH", draft);
      onUpdated(result);
      setSuccess("Your account details are updated.");
    });
  }
  async function password() {
    await run(async () => {
      if (newPassword !== confirmPassword)
        throw new Error("Your new passwords do not match.");
      if (newPassword.length < 10)
        throw new Error("Use at least 10 characters for your new password.");
      const result = await API.request<{ token: string }>(
        "/me/password",
        "POST",
        { currentPassword, newPassword },
      );
      API.setToken(result.token);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setSuccess(
        "Password changed. Other marketplace sessions have been signed out.",
      );
    });
  }
  async function locate() {
    await run(async () => {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted)
        throw new Error(
          "Allow location access in your device settings, or enter your area manually.",
        );
      const result = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const addresses = await Location.reverseGeocodeAsync(result.coords);
      const address = addresses[0];
      setCoords({
        latitude: result.coords.latitude,
        longitude: result.coords.longitude,
      });
      setConsent(false);
      if (address)
        setLocationArea(
          address.city || address.subregion || address.region || profile.area,
        );
      setSuccess(
        farmer
          ? "Location captured. Check your area and consent before saving."
          : "Area found. Review it below before saving.",
      );
    });
  }
  async function saveLocation() {
    await run(async () => {
      let result: Profile;
      if (farmer) {
        if (!coords || !consent)
          throw new Error(
            "Capture your farm location and confirm storage consent first.",
          );
        result = await API.request<Profile>("/me/location", "PATCH", {
          ...coords,
          area: locationArea,
          consent: true,
        });
      } else {
        result = await API.request<Profile>("/me", "PATCH", {
          ...draft,
          area: locationArea,
        });
      }
      onUpdated(result);
      setCoords(null);
      setConsent(false);
      setSuccess("Your area and location settings are saved.");
    });
  }
  async function removeLocation() {
    await run(async () => {
      await API.request("/me/location", "DELETE");
      onUpdated({ ...profile, latitude: undefined, longitude: undefined });
      setCoords(null);
      setConsent(false);
      setSuccess(
        "Stored farm coordinates removed. Add a location again before publishing new produce.",
      );
    });
  }
  async function deleteAccount() {
    await run(async () => {
      await API.request("/me", "DELETE", {
        password: deletePassword,
        confirmation,
      });
      setDeletePassword("");
      setConfirmation("");
      await onDeleted();
    });
  }
  return (
    <View style={{ gap: 20 }}>
      <View style={{ gap: 10 }}>
        <Text style={s.kicker}>YOUR PLACE IN THE MARKET</Text>
        <Text style={s.hero}>Make yourself at home.</Text>
        <Text style={s.subtitle}>
          Manage your details, location and account security.
        </Text>
      </View>
      <View style={s.identity}>
        <View style={s.avatar}>
          <Text style={{ fontSize: 25, color: c.brown, fontWeight: "700" }}>
            {profile.name[0].toUpperCase()}
          </Text>
        </View>
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={s.title}>{profile.name}</Text>
          <Text style={s.muted}>
            {farmer ? "Farmer account" : "Buyer account"} · {profile.area}
          </Text>
          {profile.email ? <Text style={s.muted}>{profile.email}</Text> : null}
        </View>
      </View>
      <View style={s.tabs}>
        {["Details", "Location", "Security"].map((t) => (
          <Pressable
            key={t}
            accessibilityRole="tab"
            accessibilityLabel={`Account ${t}`}
            accessibilityState={{ selected: page === t }}
            onPress={() => navigate(t)}
            style={[s.tab, page === t && { backgroundColor: c.brown }]}
          >
            <Text
              style={{
                color: page === t ? c.paper : c.brown,
                fontWeight: "600",
              }}
            >
              {t}
            </Text>
          </Pressable>
        ))}
      </View>
      {error !== "" && (
        <View accessibilityRole="alert" style={s.feedback}>
          <Text style={{ color: c.error, lineHeight: 22 }}>{error}</Text>
        </View>
      )}
      {success !== "" && (
        <View accessibilityRole="alert" style={s.feedback}>
          <Text style={s.label}>{success}</Text>
        </View>
      )}
      {page === "Details" && (
        <View style={s.card}>
          <Text style={s.title}>Your account details</Text>
          <Field
            label="Full name"
            value={draft.name}
            onChange={change("name")}
          />
          <Field
            label="Phone number"
            value={draft.phone}
            onChange={change("phone")}
          />
          <Field
            label="Alternative contact"
            value={draft.alternate}
            onChange={change("alternate")}
          />
          <Field
            label={farmer ? "Farm area" : "Shopping area"}
            value={draft.area}
            onChange={change("area")}
          />
          {farmer && (
            <Field
              label="What you grow"
              value={draft.produce}
              onChange={change("produce")}
            />
          )}
          <Button
            title={busy ? "Saving…" : "Save details"}
            onPress={saveDetails}
            disabled={busy}
          />
        </View>
      )}
      {page === "Location" && (
        <View style={s.card}>
          <Text style={s.title}>
            {farmer ? "Your farm location" : "Your shopping area"}
          </Text>
          <Text style={s.subtitle}>
            {farmer
              ? "Capture your location while at the farm. Your coordinates are stored privately; buyers see only your area."
              : "Save the area you shop in. Your exact coordinates are used temporarily to find the area and are not stored."}
          </Text>
          <View style={s.feedback}>
            <Text style={s.label}>
              {farmer
                ? profile.latitude != null
                  ? "Farm location saved"
                  : "No farm coordinates saved"
                : profile.area}
            </Text>
            <Text style={s.muted}>
              {farmer
                ? "A saved location is required to publish new produce."
                : "The nearby market filter uses this area when no live search location is selected."}
            </Text>
          </View>
          <Button
            title={
              busy
                ? "Locating…"
                : farmer
                  ? "Capture current farm location"
                  : "Find my current area"
            }
            secondary
            onPress={locate}
            disabled={busy}
          />
          <Field
            label="Location area"
            value={locationArea}
            onChange={setLocationArea}
          />
          {farmer && coords && (
            <Pressable
              accessibilityRole="checkbox"
              accessibilityState={{ checked: consent }}
              onPress={() => setConsent((v) => !v)}
              style={s.consent}
            >
              <Text style={s.label}>{consent ? "☑" : "☐"}</Text>
              <Text style={[s.muted, { flex: 1 }]}>
                I agree to store these farm coordinates privately for nearby
                searches.
              </Text>
            </Pressable>
          )}
          <Button
            title="Save location settings"
            onPress={saveLocation}
            disabled={
              busy || !locationArea.trim() || (farmer && (!coords || !consent))
            }
          />
          {farmer && profile.latitude != null && (
            <>
              <Text style={s.muted}>
                Removing coordinates hides your farm from GPS radius searches.
                Your area remains visible on existing listings.
              </Text>
              <Button
                title="Remove stored farm location"
                secondary
                onPress={removeLocation}
                disabled={busy}
              />
            </>
          )}
        </View>
      )}
      {page === "Security" && (
        <View style={s.card}>
          <Text style={s.title}>Change your password</Text>
          <Text style={s.subtitle}>
            You sign in with a password. Use at least 10 characters. Other
            marketplace sessions will be signed out.
          </Text>
          <Field
            label="Current password"
            value={currentPassword}
            onChange={setCurrentPassword}
            secure
          />
          <Field
            label="New password"
            value={newPassword}
            onChange={setNewPassword}
            secure
          />
          <Field
            label="Confirm new password"
            value={confirmPassword}
            onChange={setConfirmPassword}
            secure
          />
          <Button
            title={busy ? "Updating…" : "Update password"}
            onPress={password}
            disabled={
              busy || !currentPassword || !newPassword || !confirmPassword
            }
          />
        </View>
      )}
      {page === "Delete" && (
        <View style={[s.card, { borderColor: c.error }]}>
          <Text style={[s.title, { color: c.error }]}>Delete your account</Text>
          <Text style={s.subtitle}>
            This removes your login, personal details and active listings. Open
            orders are cancelled and reserved stock is released. Shared purchase
            records remain with anonymous account details.
          </Text>
          <Text style={s.muted}>
            Your chats, including the other participant’s copy, and produce
            photos are scheduled for deletion. Cleanup retries automatically if
            a service is unavailable. This action cannot be undone.
          </Text>
          <Field
            label="Password to delete account"
            value={deletePassword}
            onChange={setDeletePassword}
            secure
          />
          <Field
            label="Type DELETE to confirm"
            value={confirmation}
            onChange={setConfirmation}
          />
          <Button
            title={busy ? "Deleting…" : "Permanently delete account"}
            danger
            onPress={deleteAccount}
            disabled={busy || !deletePassword || confirmation !== "DELETE"}
          />
          <Button
            title="Keep my account"
            secondary
            onPress={() => navigate("Details")}
            disabled={busy}
          />
        </View>
      )}
      {busy && <ActivityIndicator color={c.brown} />}
      <Button title="Log out" secondary onPress={onLogout} disabled={busy} />
      {page !== "Delete" && (
        <Pressable
          accessibilityRole="button"
          onPress={() => navigate("Delete")}
          style={{ alignSelf: "center", padding: 12 }}
        >
          <Text style={{ color: c.error, fontSize: 13, fontWeight: "600" }}>
            Delete account
          </Text>
        </Pressable>
      )}
    </View>
  );
}
const s = StyleSheet.create({
  kicker: {
    color: c.clay,
    fontSize: 10,
    letterSpacing: 1.7,
    fontWeight: "800",
  },
  hero: {
    fontFamily: Platform.OS === "ios" ? "Georgia" : "serif",
    fontSize: 36,
    lineHeight: 42,
    color: c.ink,
    letterSpacing: -1,
  },
  subtitle: { fontSize: 15, lineHeight: 24, color: c.muted },
  muted: { fontSize: 12, lineHeight: 20, color: c.muted },
  label: { fontSize: 13, lineHeight: 21, color: c.brown, fontWeight: "600" },
  title: { fontSize: 19, fontWeight: "700", color: c.ink },
  identity: {
    flexDirection: "row",
    gap: 14,
    padding: 18,
    borderRadius: 20,
    backgroundColor: c.soft,
    alignItems: "center",
  },
  avatar: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: c.cream,
    alignItems: "center",
    justifyContent: "center",
  },
  tabs: {
    flexDirection: "row",
    padding: 5,
    borderRadius: 16,
    backgroundColor: c.soft,
    gap: 4,
  },
  tab: { flex: 1, paddingVertical: 11, borderRadius: 12, alignItems: "center" },
  card: {
    padding: 20,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.paper,
    gap: 17,
  },
  input: {
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 12,
    padding: 14,
    minHeight: 50,
    fontSize: 15,
    color: c.ink,
    backgroundColor: c.background,
  },
  button: {
    backgroundColor: c.brown,
    padding: 16,
    borderRadius: 13,
    minHeight: 49,
    alignItems: "center",
    justifyContent: "center",
  },
  secondary: { backgroundColor: c.soft },
  feedback: { padding: 16, borderRadius: 14, backgroundColor: c.cream, gap: 6 },
  consent: { flexDirection: "row", alignItems: "center", gap: 10 },
});
