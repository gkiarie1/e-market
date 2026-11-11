import React, { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo, ActivityIndicator, Animated, BackHandler, Keyboard,
  KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet,
  Text, TextInput, View, useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as Location from 'expo-location';
import * as API from '../api';
import type { Profile, Role } from '../model';
import { colors as c } from '../theme';

type Step = 'role' | 'details' | 'security' | 'contact' | 'produce' | 'location' | 'review';
type Draft = {
  role: Role; name: string; email: string; password: string; confirm: string;
  phone: string; alternate: string; area: string; produce: string;
};
const initialDraft: Draft = { role: 'buyer', name: '', email: '', password: '', confirm: '', phone: '', alternate: '', area: '', produce: '' };
const serif = Platform.select({ ios: 'Georgia', android: 'serif', default: 'Georgia, serif' });
const stepsFor = (role: Role): Step[] => role === 'farmer'
  ? ['role', 'details', 'security', 'contact', 'produce', 'location', 'review']
  : ['role', 'details', 'security', 'contact', 'location', 'review'];
const titles: Record<Step, [string, string, string]> = {
  role: ['A PLACE FOR EVERYONE', 'How will you use\nthe market?', 'Come for the fresh finds. Stay for the community.'],
  details: ['NICE TO MEET YOU', 'Let’s make this\nfeel like home.', 'Start with your name and the email you’ll use to sign in.'],
  security: ['A LITTLE PEACE OF MIND', 'Your own key\nto the market.', 'Choose a password you’ll remember and keep it to yourself.'],
  contact: ['LET’S STAY CONNECTED', 'Good conversations\nstart here.', 'Add a number where people can reach you about their orders.'],
  produce: ['FROM YOUR FARM', 'What’s growing\nyour way?', 'Tell buyers a little about what they can find at your farm.'],
  location: ['CLOSER TO HOME', 'Where’s your\ncorner of the market?', 'Your area helps connect you with your local community.'],
  review: ['ONE LAST LOOK', 'You’re nearly\npart of the market.', 'Check your details, then make yourself at home.'],
};

function Action({ title, onPress, busy = false, disabled = false }: { title: string; onPress: () => void; busy?: boolean; disabled?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={title} accessibilityState={{ disabled: disabled || busy, busy }} disabled={disabled || busy} onPress={onPress}
    style={({ pressed }) => [a.action, (disabled || busy) && a.disabled, pressed && a.pressed]}>
    <Text style={a.actionText}>{title}</Text>{busy ? <ActivityIndicator color={c.cream}/> : <Text style={a.actionArrow}>→</Text>}
  </Pressable>;
}

function Input({ label, value, onChange, hint, placeholder, kind = 'text', secure = false, multiline = false, disabled = false, onSubmit, maxLength }: {
  label: string; value: string; onChange: (value: string) => void; hint?: string; placeholder?: string;
  kind?: 'text' | 'email' | 'phone' | 'name'; secure?: boolean; multiline?: boolean; disabled?: boolean; onSubmit?: () => void; maxLength?: number;
}) {
  const [focused, setFocused] = useState(false);
  const [visible, setVisible] = useState(false);
  return <View style={a.field}>
    <Text style={a.fieldLabel}>{label}</Text>
    <View style={[a.inputWrap, focused && a.inputFocus]}>
      <TextInput accessibilityLabel={label} accessibilityHint={hint} value={value} onChangeText={onChange}
        placeholder={placeholder} placeholderTextColor="#A18F7F" editable={!disabled}
        style={[a.input, multiline && a.multiline]} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
        secureTextEntry={secure && !visible} multiline={multiline} textAlignVertical={multiline ? 'top' : 'center'}
        keyboardType={kind === 'email' ? 'email-address' : kind === 'phone' ? 'phone-pad' : 'default'}
        autoCapitalize={secure || kind === 'email' ? 'none' : kind === 'name' ? 'words' : 'sentences'}
        autoCorrect={!secure && kind === 'text'}
        autoComplete={secure ? 'off' : kind === 'email' ? 'email' : kind === 'phone' ? 'tel' : kind === 'name' ? 'name' : 'off'}
        maxLength={maxLength ?? (secure ? 128 : kind === 'email' ? 254 : kind === 'phone' ? 30 : multiline ? 300 : 100)}
        returnKeyType={onSubmit ? 'go' : 'next'} onSubmitEditing={onSubmit}/>
      {secure && <Pressable accessibilityRole="button" accessibilityLabel={visible ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
        hitSlop={8} onPress={() => setVisible(!visible)} style={a.showPassword}><Text style={a.showText}>{visible ? 'Hide' : 'Show'}</Text></Pressable>}
    </View>
    {hint && <Text style={a.hint}>{hint}</Text>}
  </View>;
}

// A small market-stall illustration built from native views, so it also works offline.
function MarketStall({ compact }: { compact: boolean }) {
  return <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[a.art, compact && a.artCompact]}>
    <View style={a.artSun}/><View style={a.artArch}/>
    <View style={a.stall}>
      <View style={a.stallRoof}/>
      <View style={a.awning}>{[0, 1, 2, 3, 4, 5, 6].map(n => <View key={n} style={[a.awningStripe, n % 2 === 0 && a.awningLight]}/>)}</View>
      <View style={a.stallInside}><View style={a.stallPost}/><View style={a.crates}>
        {[0, 1, 2].map(n => <View key={n} style={[a.crate, n === 1 && { height: 46 }]}><View style={a.harvestRow}>{[0, 1, 2].map(i => <View key={i} style={[a.harvest, { backgroundColor: ['#B8754F', '#E4B773', '#8D523A'][n] }]}/>)}</View><View style={a.crateSlat}/><View style={a.crateSlat}/></View>)}
      </View><View style={a.stallPost}/></View>
      <View style={a.stallCounter}/><View style={a.stallBase}><View style={a.stallSign}><Text style={a.stallSignText}>FARM • FRESH • LOCAL</Text></View></View>
    </View><View style={a.ground}/>
  </View>;
}

export default function AuthScreen({ onAuthenticated }: { onAuthenticated: (result: { token: string; profile: Profile }) => void }) {
  const { width } = useWindowDimensions();
  const wide = width >= 860;
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [draft, setDraft] = useState<Draft>(initialDraft);
  const [stepIndex, setStepIndex] = useState(0);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const [locating, setLocating] = useState(false);
  const [coordinates, setCoordinates] = useState<{ latitude: number; longitude: number } | null>(null);
  const [consent, setConsent] = useState(false);
  const steps = stepsFor(draft.role);
  const step = steps[stepIndex];
  const registering = mode === 'register';
  const scroll = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const fade = useRef(new Animated.Value(1)).current;
  const reducedMotion = useRef(false);
  const pending = busy || locating;

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(value => { reducedMotion.current = value; });
    const listener = AccessibilityInfo.addEventListener('reduceMotionChanged', value => { reducedMotion.current = value; });
    return () => listener.remove();
  }, []);
  useEffect(() => {
    scroll.current?.scrollTo({ y: 0, animated: false });
    if (Platform.OS === 'web') window.scrollTo({ top: 0, behavior: 'auto' });
    if (reducedMotion.current) { fade.setValue(1); return; }
    fade.setValue(0);
    const animation = Animated.timing(fade, { toValue: 1, duration: 220, useNativeDriver: Platform.OS !== 'web' });
    animation.start();
    return () => animation.stop();
  }, [mode, stepIndex]);
  useEffect(() => {
    const handler = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!registering) return false;
      if (!pending) goBack();
      return true;
    });
    return () => handler.remove();
  }, [mode, stepIndex, pending]);

  function change<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft(previous => ({ ...previous, [key]: value })); setError('');
  }
  function switchMode(next: 'login' | 'register') {
    if (pending) return;
    Keyboard.dismiss(); setError(''); setStepIndex(0); setMode(next);
  }
  function goBack() {
    if (pending) return;
    Keyboard.dismiss(); setError('');
    if (stepIndex === 0) switchMode('login'); else setStepIndex(i => i - 1);
  }
  function validate(current: Step): string {
    if (current === 'details') {
      if (!draft.name.trim()) return 'What name would you like us to use?';
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.email.trim())) return 'Enter a valid email address so you can sign in later.';
    }
    if (current === 'security') {
      if (draft.password.length < 10) return 'Your password needs at least 10 characters.';
      if (draft.password !== draft.confirm) return 'Your passwords don’t match yet. Give them another look.';
    }
    if (current === 'contact') {
      if (draft.phone.trim().length < 7) return 'Add a phone number with at least 7 characters.';
      if (draft.role === 'farmer' && !draft.alternate.trim()) return 'Add an alternative contact for your farm.';
    }
    if (current === 'produce' && !draft.produce.trim()) return 'Tell us what you grow or sell. You can add individual listings later.';
    if (current === 'location') {
      if (!draft.area.trim()) return 'Add your town or area so your community can find you.';
      if (draft.role === 'farmer' && !coordinates) return 'Capture your farm’s location while you’re at the farm.';
      if (draft.role === 'farmer' && !consent) return 'Confirm that we can save your farm location to help nearby buyers find you.';
    }
    return '';
  }
  function continueStep() {
    if (pending) return;
    const problem = validate(step);
    if (problem) { setError(problem); return; }
    Keyboard.dismiss(); setError(''); setStepIndex(i => Math.min(i + 1, steps.length - 1));
  }
  async function captureLocation() {
    if (pending) return;
    Keyboard.dismiss(); setLocating(true); setError('');
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted') throw new Error('Location access wasn’t allowed. Enable it in your device settings, then try again.');
      const result = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setCoordinates({ latitude: result.coords.latitude, longitude: result.coords.longitude });
      // Reverse geocoding is optional; keep valid GPS coordinates if it fails.
      if (Platform.OS !== 'web') try {
        const places = await Location.reverseGeocodeAsync(result.coords);
        const place = places[0]; const label = place?.city || place?.subregion || place?.region;
        if (label) setDraft(previous => ({ ...previous, area: previous.area || label }));
      } catch { /* The farmer can enter the area manually. */ }
    } catch (problem) { setError(problem instanceof Error ? problem.message : 'We couldn’t find your location. Please try again.'); }
    finally { setLocating(false); }
  }
  async function submit() {
    if (submitting.current || locating) return;
    setError('');
    if (registering) {
      for (const item of steps) {
        const problem = validate(item);
        if (problem) { setStepIndex(steps.indexOf(item)); setError(problem); return; }
      }
    } else if (!draft.email.trim() || !draft.password) { setError('Enter your email and password to come back in.'); return; }
    submitting.current = true; setBusy(true); Keyboard.dismiss();
    try {
      const credentials = { email: draft.email.trim(), password: draft.password };
      const data = registering ? {
        ...credentials, name: draft.name.trim(), role: draft.role, phone: draft.phone.trim(),
        alternate: draft.role === 'farmer' ? draft.alternate.trim() : '', area: draft.area.trim(),
        produce: draft.role === 'farmer' ? draft.produce.trim() : '',
        ...(draft.role === 'farmer' ? { ...coordinates, locationConsent: consent } : {}),
      } : credentials;
      const result = await API.login(data, registering);
      setDraft(initialDraft); onAuthenticated(result);
    } catch (problem) { setError(problem instanceof Error ? problem.message : 'We couldn’t connect. Please try again.'); }
    finally { submitting.current = false; setBusy(false); }
  }
  function edit(target: Step) { setError(''); setStepIndex(steps.indexOf(target)); }

  const title = registering ? titles[step] : ['BACK TO YOUR PEOPLE', 'A fresh start\nto your day.', 'Your farmers, your favourites, your local market.'];
  const caption = registering ? 'A few small steps. A whole community ahead.' : 'Real people. Honest harvests. A better way to buy and sell.';
  return <SafeAreaView style={a.safe}><StatusBar style="dark"/>
    <KeyboardAvoidingView style={a.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView ref={scroll} contentContainerStyle={[a.page, wide && a.pageWide]} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}>
        <View style={a.brandRow}><View style={a.brandLockup}><View style={a.brandSeal}><Text style={a.brandSealText}>sm.</Text></View><View><Text style={a.brandName}>shamba</Text><Text style={a.brandSmall}>THE FARMERS’ MARKET</Text></View></View><Text style={a.brandNote}>A little closer{wide ? ' to home.' : '\nto home.'}</Text></View>
        <View style={[a.layout, wide && a.layoutWide]}>
          {wide && <View style={[a.story, a.storyWide]}>
            <View style={a.storyBadge}><View style={a.dot}/><Text style={a.storyBadgeText}>ROOTED IN COMMUNITY</Text></View>
            <Text style={[a.storyTitle, !wide && a.storyTitleSmall]}>From our soil.{wide ? '\n' : ' '}To your table.</Text>
            <Text style={a.storyCopy}>{caption}</Text>
            {(!registering || wide) && <MarketStall compact={!wide}/>}
            {wide && <View style={a.storyFooter}><Text style={a.storyFooterMark}>✦</Text><Text style={a.storyFooterText}>Good things grow when{ '\n'}we trade together.</Text></View>}
          </View>}
          <Animated.View style={[a.panel, wide ? a.panelWide : a.panelStandalone, { opacity: fade, transform: [{ translateY: fade.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }] }]}>
            {registering ? <View style={a.progressBlock}><View style={a.progressTop}><Pressable accessibilityRole="button" accessibilityLabel={stepIndex ? 'Previous registration step' : 'Back to login'} disabled={pending} onPress={goBack} style={a.back}><Text style={a.backText}>←</Text></Pressable><Text accessibilityLiveRegion="polite" style={a.stepLabel}>STEP {stepIndex + 1} OF {steps.length}</Text><Text style={a.stepName}>{step === 'role' ? 'Your place' : step === 'review' ? 'Ready to go' : 'Getting to know you'}</Text></View><View accessibilityLabel={`Registration progress, step ${stepIndex + 1} of ${steps.length}`} style={a.progressTrack}>{steps.map((item, i) => <View key={item} style={[a.progressPart, i <= stepIndex && a.progressDone]}/>)}</View></View> : <View style={a.modeTabs}><Pressable accessibilityRole="tab" accessibilityState={{ selected: true }} style={[a.modeTab, a.modeTabActive]}><Text style={a.modeTabSelected}>Log in</Text></Pressable><Pressable accessibilityRole="tab" accessibilityState={{ selected: false }} disabled={pending} onPress={() => switchMode('register')} style={a.modeTab}><Text style={a.modeTabText}>Join the market</Text></Pressable></View>}
            <Text style={a.eyebrow}>{title[0]}</Text><Text accessibilityRole="header" style={[a.title, !wide && a.titleSmall]}>{title[1]}</Text><Text style={a.description}>{title[2]}</Text>
            {error !== '' && <View accessibilityRole="alert" accessibilityLiveRegion="polite" style={a.errorBox}><Text style={a.errorMark}>!</Text><Text style={a.errorText}>{error}</Text></View>}
            <View style={a.fields}>
              {!registering && <><Input label="Email address" placeholder="you@example.com" value={draft.email} onChange={v => change('email', v)} kind="email" disabled={pending}/><Input label="Password" placeholder="Your password" value={draft.password} onChange={v => change('password', v)} secure disabled={pending} onSubmit={submit}/><Action title="Welcome back" onPress={submit} busy={busy}/><View style={a.joinLine}><Text style={a.smallText}>New around here?</Text><Pressable accessibilityRole="button" disabled={pending} onPress={() => switchMode('register')} hitSlop={8}><Text style={a.inlineLink}>Make yourself at home →</Text></Pressable></View></>}
              {registering && step === 'role' && <View accessibilityRole="radiogroup" accessibilityLabel="Your place in the market" style={a.roleList}>{(['buyer', 'farmer'] as const).map(role => <Pressable key={role} accessibilityRole="radio" accessibilityState={{ checked: draft.role === role }} onPress={() => change('role', role)} style={({ pressed }) => [a.roleCard, draft.role === role && a.roleCardSelected, pressed && a.pressed]}><View style={[a.roleMonogram, draft.role === role && a.roleMonogramSelected]}><Text style={[a.roleLetter, draft.role === role && a.roleLetterSelected]}>{role === 'buyer' ? 'B' : 'F'}</Text></View><View style={a.roleCopy}><Text style={a.roleTitle}>{role === 'buyer' ? 'I’m here to buy' : 'I’m here to sell'}</Text><Text style={a.roleDescription}>{role === 'buyer' ? 'Find fresh produce. Meet your local farmers.' : 'Share your harvest. Grow your customer base.'}</Text></View><View style={[a.radio, draft.role === role && a.radioSelected]}>{draft.role === role && <View style={a.radioDot}/>}</View></Pressable>)}</View>}
              {registering && step === 'details' && <><Input label="Your full name" placeholder="What should we call you?" value={draft.name} onChange={v => change('name', v)} kind="name"/><Input label="Email address" placeholder="you@example.com" value={draft.email} onChange={v => change('email', v)} kind="email" hint="You’ll use this email to log in."/></>}
              {registering && step === 'security' && <><Input label="Choose a password" placeholder="Make it your own" value={draft.password} onChange={v => change('password', v)} secure hint="At least 10 characters. A few words work well."/><Input label="Confirm your password" placeholder="One more time" value={draft.confirm} onChange={v => change('confirm', v)} secure/>{draft.confirm.length > 0 && draft.confirm === draft.password && <Text style={a.successText}>✓ Your passwords match.</Text>}</>}
              {registering && step === 'contact' && <><Input label="Phone number" placeholder="e.g. 0712 345 678" value={draft.phone} onChange={v => change('phone', v)} kind="phone" hint={draft.role === 'farmer' ? 'Buyers can use this to arrange an order with you.' : 'For conversations about your orders.'}/>{draft.role === 'farmer' && <Input label="Alternative contact" maxLength={30} placeholder="A second phone number or contact" value={draft.alternate} onChange={v => change('alternate', v)} hint="A backup way for buyers to reach your farm."/>}</>}
              {registering && step === 'produce' && <><Input label="What do you grow or sell?" placeholder="For example: tomatoes, potatoes, fresh eggs…" value={draft.produce} onChange={v => change('produce', v)} multiline hint="A short introduction is enough. Add photos, prices, and quantities after joining."/><View style={a.note}><Text style={a.noteHeading}>Every harvest has a home here.</Text><Text style={a.noteText}>Whether it’s a small kitchen garden or a full farm, your produce belongs at the market.</Text></View></>}
              {registering && step === 'location' && <><Input label={draft.role === 'farmer' ? 'Farm town or area' : 'Your town or area'} placeholder="e.g. Kiambu, Nakuru, Nairobi" value={draft.area} onChange={v => change('area', v)} disabled={locating}/>{draft.role === 'farmer' ? <><View style={[a.locationCard, coordinates && a.locationCaptured]}><View style={a.locationIcon}><Text style={a.locationIconText}>{coordinates ? '✓' : '◎'}</Text></View><View style={a.flex}><Text style={a.noteHeading}>{coordinates ? 'Farm location captured' : 'Put your farm on the local map'}</Text><Text style={a.noteText}>Capture this while at your farm. We keep exact coordinates private; buyers see your area and approximate distance.</Text></View></View><Pressable accessibilityRole="button" disabled={pending} onPress={captureLocation} style={a.outlineButton}>{locating ? <ActivityIndicator color={c.brown}/> : <Text style={a.outlineText}>{coordinates ? 'Capture location again' : 'Use my current farm location'}</Text>}</Pressable><Pressable accessibilityRole="checkbox" accessibilityState={{ checked: consent }} onPress={() => { setConsent(!consent); setError(''); }} style={a.consentRow}><View style={[a.checkbox, consent && a.checkboxChecked]}>{consent && <Text style={a.check}>✓</Text>}</View><Text style={a.consentText}>I agree to save my farm’s location so nearby buyers can find my produce.</Text></Pressable></> : <View style={a.note}><Text style={a.noteHeading}>Start with your neighbourhood.</Text><Text style={a.noteText}>We’ll use this area to help you browse locally. You can search using your current location once you’re inside.</Text></View>}</>}
              {registering && step === 'review' && <><View style={a.reviewIntro}><Text style={a.reviewStamp}>✓</Text><View style={a.flex}><Text style={a.noteHeading}>{draft.role === 'farmer' ? 'Your farm has a place here.' : 'Your next fresh find is waiting.'}</Text><Text style={a.noteText}>Joining as a {draft.role === 'farmer' ? 'farmer & seller' : 'buyer'}</Text></View></View>{[
                { label: 'ABOUT YOU', value: `${draft.name}\n${draft.email}`, target: 'details' as Step },
                { label: 'CONTACT', value: `${draft.phone}${draft.role === 'farmer' ? '\n' + draft.alternate : ''}`, target: 'contact' as Step },
                ...(draft.role === 'farmer' ? [{ label: 'YOUR HARVEST', value: draft.produce, target: 'produce' as Step }] : []),
                { label: 'YOUR AREA', value: `${draft.area}${draft.role === 'farmer' ? '\nPrivate farm location captured' : ''}`, target: 'location' as Step },
              ].map(item => <View style={a.reviewRow} key={item.label}><View style={a.flex}><Text style={a.reviewLabel}>{item.label}</Text><Text style={a.reviewValue}>{item.value}</Text></View><Pressable accessibilityRole="button" accessibilityLabel={`Edit ${item.label.toLowerCase()}`} disabled={pending} onPress={() => edit(item.target)} hitSlop={8}><Text style={a.inlineLink}>Edit</Text></Pressable></View>)}</>}
              {registering && <><Action title={step === 'review' ? 'Join the market' : step === 'role' ? 'Find my place' : 'Continue'} onPress={step === 'review' ? submit : continueStep} busy={busy} disabled={locating}/>{stepIndex > 0 && <Pressable accessibilityRole="button" disabled={pending} onPress={goBack} style={a.backLink}><Text style={a.backLinkText}>← Back a step</Text></Pressable>}</>}
            </View>
            <View style={a.panelFooter}><View style={a.footerLine}/><Text style={a.footerCaption}>LOCAL ROOTS. REAL CONNECTIONS.</Text><View style={a.footerLine}/></View>
            {registering && <View style={a.joinLine}><Text style={a.smallText}>Already part of the market?</Text><Pressable accessibilityRole="button" disabled={pending} onPress={() => switchMode('login')} hitSlop={8}><Text style={a.inlineLink}>Log in</Text></Pressable></View>}
          </Animated.View>
        </View>
        <Text style={a.pageFooter}>A market built around people, from the ground up.</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}

const a = StyleSheet.create({
  flex: { flex: 1 }, safe: { flex: 1, backgroundColor: c.background },
  page: { flexGrow: 1, padding: 22, paddingBottom: 32 }, pageWide: { padding: 40, maxWidth: 1240, width: '100%', alignSelf: 'center' },
  brandRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28, gap: 12 },
  brandLockup: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  brandSeal: { width: 43, height: 43, borderRadius: 22, backgroundColor: c.brown, justifyContent: 'center', alignItems: 'center' },
  brandSealText: { color: c.cream, fontFamily: serif, fontSize: 24, marginTop: -3 },
  brandName: { fontFamily: serif, fontSize: 28, color: c.ink, letterSpacing: -1 },
  brandSmall: { fontSize: 8, fontWeight: '700', letterSpacing: 1.7, color: c.muted, marginTop: 1 },
  brandNote: { color: c.muted, fontSize: 11, lineHeight: 17, textAlign: 'right' },
  layout: { gap: 0 }, layoutWide: { flexDirection: 'row', alignItems: 'stretch' },
  story: { backgroundColor: c.brownDark, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, overflow: 'hidden' },
  storyWide: { flex: 0.95, borderTopRightRadius: 0, borderBottomLeftRadius: 28, borderTopLeftRadius: 28, padding: 38, minHeight: 700 },
  storyBadge: { flexDirection: 'row', gap: 8, alignItems: 'center' }, dot: { width: 5, height: 5, backgroundColor: '#D9AF80', borderRadius: 3 },
  storyBadgeText: { color: '#D6B696', fontSize: 8, letterSpacing: 1.8, fontWeight: '600' },
  storyTitle: { fontFamily: serif, fontSize: 49, color: c.cream, lineHeight: 58, letterSpacing: -1.5, marginTop: 30 },
  storyTitleSmall: { fontSize: 25, lineHeight: 33, marginTop: 12, letterSpacing: -0.5 },
  storyCopy: { color: '#DCC4AD', fontSize: 14, lineHeight: 24, maxWidth: 290, marginTop: 16 },
  storyFooter: { flexDirection: 'row', alignItems: 'center', gap: 16, borderTopWidth: 1, borderColor: '#77553C', paddingTop: 22, marginTop: 'auto' },
  storyFooterMark: { color: '#D9AF80', fontSize: 38 }, storyFooterText: { color: '#EBD8C1', fontSize: 13, lineHeight: 21 },
  panel: { backgroundColor: '#FFFDFA', padding: 24, paddingTop: 28, borderBottomLeftRadius: 24, borderBottomRightRadius: 24, borderWidth: 1, borderTopWidth: 0, borderColor: c.border },
  panelStandalone: { borderTopWidth: 1, borderTopLeftRadius: 24, borderTopRightRadius: 24 },
  panelWide: { flex: 1, padding: 44, paddingTop: 36, borderTopRightRadius: 28, borderBottomLeftRadius: 0, borderTopWidth: 1, borderLeftWidth: 0 },
  modeTabs: { flexDirection: 'row', backgroundColor: c.soft, padding: 4, borderRadius: 12, marginBottom: 32 },
  modeTab: { flex: 1, minHeight: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 9 }, modeTabActive: { backgroundColor: '#FFFDFA' },
  modeTabSelected: { color: c.ink, fontWeight: '700', fontSize: 13 }, modeTabText: { color: c.muted, fontSize: 13 },
  eyebrow: { fontSize: 9, letterSpacing: 1.8, color: c.clay, fontWeight: '700', marginBottom: 12 },
  title: { fontFamily: serif, fontSize: 39, color: c.ink, lineHeight: 45, letterSpacing: -1 }, titleSmall: { fontSize: 33, lineHeight: 39 },
  description: { color: c.muted, fontSize: 14, lineHeight: 23, marginTop: 12, marginBottom: 26 },
  fields: { gap: 20 }, field: { gap: 8 }, fieldLabel: { color: c.ink, fontSize: 13, fontWeight: '600' },
  inputWrap: { flexDirection: 'row', alignItems: 'center', borderColor: c.border, borderWidth: 1, borderRadius: 12, backgroundColor: '#FFFEFC' },
  inputFocus: { borderColor: c.clay, backgroundColor: c.background }, input: { flex: 1, minHeight: 54, color: c.ink, paddingHorizontal: 15, paddingVertical: 14, fontSize: 15, borderRadius: 12 },
  multiline: { minHeight: 126, lineHeight: 24 }, hint: { fontSize: 11, color: c.muted, lineHeight: 18 },
  showPassword: { paddingHorizontal: 14, minHeight: 48, justifyContent: 'center' }, showText: { color: c.brown, fontSize: 12, fontWeight: '600' },
  action: { backgroundColor: c.brown, borderRadius: 12, minHeight: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, marginTop: 2 },
  actionText: { color: '#FFF9F1', fontWeight: '700', fontSize: 15 }, actionArrow: { color: '#E8C8A4', fontSize: 24 }, disabled: { opacity: 0.55 }, pressed: { opacity: 0.8 },
  joinLine: { flexDirection: 'row', justifyContent: 'center', gap: 6, flexWrap: 'wrap', alignItems: 'center' }, smallText: { fontSize: 12, color: c.muted, lineHeight: 20 },
  inlineLink: { color: c.brown, fontSize: 12, fontWeight: '700', lineHeight: 20 },
  progressBlock: { marginBottom: 28 }, progressTop: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 18 },
  back: { width: 34, height: 34, borderRadius: 17, backgroundColor: c.soft, alignItems: 'center', justifyContent: 'center' }, backText: { fontSize: 20, color: c.brown },
  stepLabel: { fontSize: 9, letterSpacing: 1.3, color: c.brown, fontWeight: '700' }, stepName: { fontSize: 10, color: c.muted, marginLeft: 'auto', flexShrink: 1, textAlign: 'right' },
  progressTrack: { flexDirection: 'row', gap: 5 }, progressPart: { height: 3, flex: 1, borderRadius: 3, backgroundColor: c.soft }, progressDone: { backgroundColor: c.clay },
  roleList: { gap: 12 }, roleCard: { padding: 16, borderRadius: 15, borderColor: c.border, borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  roleCardSelected: { borderColor: c.clay, backgroundColor: '#F7EDDF' }, roleMonogram: { height: 43, width: 43, borderRadius: 12, backgroundColor: c.soft, alignItems: 'center', justifyContent: 'center' },
  roleMonogramSelected: { backgroundColor: c.brown }, roleLetter: { fontFamily: serif, fontSize: 24, color: c.brown }, roleLetterSelected: { color: c.cream }, roleCopy: { flex: 1 },
  roleTitle: { color: c.ink, fontWeight: '700', fontSize: 14 }, roleDescription: { color: c.muted, fontSize: 11, lineHeight: 18, marginTop: 4 },
  radio: { width: 19, height: 19, borderRadius: 10, borderColor: '#C9B8A6', borderWidth: 1, justifyContent: 'center', alignItems: 'center' }, radioSelected: { borderColor: c.brown }, radioDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: c.brown },
  note: { padding: 17, backgroundColor: c.soft, borderRadius: 13, gap: 7 }, noteHeading: { fontSize: 13, fontWeight: '600', color: c.ink, lineHeight: 20 }, noteText: { fontSize: 12, color: c.muted, lineHeight: 20 },
  locationCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 13, borderRadius: 13, backgroundColor: c.soft, padding: 17 }, locationCaptured: { backgroundColor: '#F0E0CC' },
  locationIcon: { width: 31, height: 31, borderRadius: 16, backgroundColor: '#E4CDB3', alignItems: 'center', justifyContent: 'center' }, locationIconText: { color: c.brown, fontSize: 19 },
  outlineButton: { borderWidth: 1, borderColor: '#CBAE8F', borderRadius: 12, minHeight: 50, justifyContent: 'center', alignItems: 'center', padding: 10 }, outlineText: { color: c.brown, fontWeight: '600', fontSize: 13 },
  consentRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 11 }, checkbox: { height: 21, width: 21, borderWidth: 1, borderColor: '#BA9A7A', borderRadius: 5, justifyContent: 'center', alignItems: 'center', marginTop: 1 }, checkboxChecked: { backgroundColor: c.brown, borderColor: c.brown }, check: { color: c.cream, fontSize: 14 }, consentText: { flex: 1, fontSize: 12, color: c.muted, lineHeight: 21 },
  reviewIntro: { flexDirection: 'row', gap: 12, alignItems: 'center', marginBottom: 2 }, reviewStamp: { fontSize: 24, color: c.brown }, reviewRow: { flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: 1, borderColor: c.border, paddingBottom: 15 }, reviewLabel: { fontSize: 9, color: c.clay, letterSpacing: 1.2, fontWeight: '700', marginBottom: 6 }, reviewValue: { color: c.ink, fontSize: 13, lineHeight: 22 },
  errorBox: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, backgroundColor: '#F8E9E1', borderRadius: 10, padding: 13, marginBottom: 18 }, errorMark: { color: c.error, fontWeight: '800' }, errorText: { flex: 1, color: c.error, fontSize: 12, lineHeight: 20 }, successText: { color: c.brown, fontSize: 12 },
  backLink: { alignItems: 'center', padding: 5 }, backLinkText: { color: c.muted, fontSize: 12 },
  panelFooter: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 32, marginBottom: 20 }, footerLine: { height: 1, flex: 1, backgroundColor: c.border }, footerCaption: { color: '#A38B75', fontSize: 7, letterSpacing: 1.3, fontWeight: '700' },
  pageFooter: { textAlign: 'center', color: '#A38B75', fontSize: 10, marginTop: 24 },
  art: { height: 240, marginTop: 28, marginBottom: 24, justifyContent: 'flex-end', alignItems: 'center', overflow: 'hidden' }, artCompact: { height: 118, marginTop: 10, marginBottom: -24 },
  artSun: { position: 'absolute', width: 49, height: 49, borderRadius: 25, backgroundColor: '#AD7B51', right: 24, top: 8 },
  artArch: { position: 'absolute', width: 208, height: 222, borderTopLeftRadius: 110, borderTopRightRadius: 110, backgroundColor: '#65432D', bottom: 0 },
  stall: { width: 210 }, stallRoof: { height: 16, backgroundColor: '#AD7852', borderTopLeftRadius: 5, borderTopRightRadius: 5 },
  awning: { flexDirection: 'row', height: 26 }, awningStripe: { flex: 1, backgroundColor: '#A46A46', borderBottomLeftRadius: 10, borderBottomRightRadius: 10 }, awningLight: { backgroundColor: '#E1C29A' },
  stallInside: { height: 65, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' }, stallPost: { width: 7, height: 70, backgroundColor: '#BD8B61' },
  crates: { flexDirection: 'row', gap: 7, alignItems: 'flex-end' }, crate: { width: 53, height: 38, backgroundColor: '#97613F', borderWidth: 2, borderColor: '#C59465', justifyContent: 'flex-end', paddingBottom: 4 },
  harvestRow: { flexDirection: 'row', gap: 2, position: 'absolute', top: -11, left: 2 }, harvest: { width: 14, height: 16, borderRadius: 8 }, crateSlat: { height: 3, marginTop: 5, backgroundColor: '#C59465' },
  stallCounter: { height: 9, backgroundColor: '#D3A475', marginHorizontal: -6, borderRadius: 2 }, stallBase: { height: 73, backgroundColor: '#8C5839', borderBottomWidth: 5, borderColor: '#74452D', justifyContent: 'center', alignItems: 'center' },
  stallSign: { paddingVertical: 10, paddingHorizontal: 12, borderWidth: 1, borderColor: '#BC8C5F' }, stallSignText: { color: '#E8CBA6', fontSize: 8, letterSpacing: 1.4 }, ground: { height: 2, width: '95%', backgroundColor: '#916647' },
});
