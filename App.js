import React, { useState, useCallback, useRef, useMemo, useEffect, memo } from 'react';
import { View, Text, FlatList, Pressable, TextInput, ScrollView, Switch, Alert, Dimensions, StatusBar, StyleSheet as SS, Modal, ActivityIndicator } from 'react-native';
import { NavigationContainer, DarkTheme } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import * as Speech from 'expo-speech';
import { CameraView, useCameraPermissions, useMicrophonePermissions } from 'expo-camera';
import * as MediaLibrary from 'expo-media-library';
import { Video as Compress } from 'react-native-compressor';
import { collection, addDoc, query, where, onSnapshot, doc, updateDoc, deleteDoc, serverTimestamp, orderBy } from 'firebase/firestore';
import { ref, uploadBytes, getBlob, getDownloadURL, deleteObject } from 'firebase/storage';
import { db, storage, ADMIN_EMAIL } from './firebase';

const { height: H } = Dimensions.get('window');
const C = { bg: '#07060D', glass: 'rgba(255,255,255,0.07)', line: 'rgba(255,255,255,0.14)', cy: '#00FFFF', pk: '#FF00FF', tx: '#F4F2FF', dim: '#9A96B5' };
const NEON = [C.cy, C.pk];
// Replace with real auth state (firebase/auth onAuthStateChanged)
const ME = { uid: 'u1', email: 'admin@dmmx.com', name: 'dmm.x', level: 12, coins: 1240 };

/* ---------- shared UI ---------- */
const Glass = ({ style, children }) => (
  <View style={[{ borderRadius: 18, overflow: 'hidden', borderWidth: 1, borderColor: C.line }, style]}>
    <BlurView intensity={30} tint="dark" style={{ padding: 12, backgroundColor: C.glass }}>{children}</BlurView>
  </View>
);
const Neon = ({ label, onPress, style, icon }) => (
  <Pressable onPress={onPress} style={style}>
    <LinearGradient colors={NEON} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.neon}>
      {icon && <Ionicons name={icon} size={16} color="#000" style={{ marginRight: 6 }} />}
      <Text style={{ color: '#000', fontWeight: '800' }}>{label}</Text>
    </LinearGradient>
  </Pressable>
);
const T = ({ children, style, dim }) => <Text style={[{ color: dim ? C.dim : C.tx }, style]}>{children}</Text>;
const Ring = ({ label, size = 62 }) => (
  <View style={{ alignItems: 'center', marginRight: 12 }}>
    <LinearGradient colors={NEON} style={{ width: size + 6, height: size + 6, borderRadius: 99, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ width: size, height: size, borderRadius: 99, backgroundColor: '#1a1730', borderWidth: 3, borderColor: C.bg, alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name="person" size={26} color={C.dim} />
      </View>
    </LinearGradient>
    <T dim style={{ fontSize: 11, marginTop: 4 }}>{label}</T>
  </View>
);
const Screen = ({ children }) => <View style={{ flex: 1, backgroundColor: C.bg }}>{children}</View>;
const Head = ({ title, right }) => (
  <View style={s.head}><T style={s.h1}>{title}</T><View style={{ flexDirection: 'row', gap: 14 }}>{right}</View></View>
);

/* ---------- 1. HOME ---------- */
const CHIPS = ['All', 'Gym', 'Study', 'Professional', 'Boxing', 'KungFu', 'Routine'];
const PRIORITY = ['Gym', 'Study', 'Professional']; // AI ranking: these first
const KINDS = ['text', 'image', 'video', 'link', 'poll', 'event'];
const mkPost = (i) => ({ id: 'p' + i, kind: KINDS[i % 6], tag: CHIPS[1 + (i % 6)], user: 'user_' + i, text: `Post #${i} #${CHIPS[1 + (i % 6)].toLowerCase()} grind` });
const rank = (a) => [...a].sort((x, y) => PRIORITY.includes(y.tag) - PRIORITY.includes(x.tag));

const Post = memo(({ p, onLive }) => {
  const [liked, setLiked] = useState(false), [saved, setSaved] = useState(false);
  const [vote, setVote] = useState(null);
  return (
    <Glass style={{ marginHorizontal: 14, marginBottom: 14 }}>
      <T style={{ fontWeight: '700' }}>@{p.user} <T dim style={{ fontWeight: '400' }}>· {p.tag}</T></T>
      <T style={{ marginVertical: 8 }}>{p.text}</T>
      {p.kind === 'image' && <LinearGradient colors={['#1b2b4a', '#4a1b4a']} style={s.media} />}
      {p.kind === 'video' && <LinearGradient colors={['#102a2a', '#2a1030']} style={[s.media, { alignItems: 'center', justifyContent: 'center' }]}><Ionicons name="play-circle" size={52} color={C.cy} /></LinearGradient>}
      {p.kind === 'link' && <Glass><T>🔗 dmmx.app/article</T><T dim>10 min gym split guide</T></Glass>}
      {p.kind === 'poll' && ['Push/Pull/Legs', 'Bro split'].map((o) => (
        <Pressable key={o} onPress={() => setVote(o)} style={[s.poll, vote === o && { borderColor: C.cy }]}><T>{o}{vote ? (vote === o ? '  62%' : '  38%') : ''}</T></Pressable>))}
      {p.kind === 'event' && <Glass><T>📅 Sat 6 PM · Sparring Night</T><Neon label="Interested" style={{ marginTop: 8 }} /></Glass>}
      <View style={s.row}>
        <Pressable onPress={() => setLiked(!liked)}><Ionicons name={liked ? 'heart' : 'heart-outline'} size={24} color={liked ? C.pk : C.tx} /></Pressable>
        <Ionicons name="chatbubble-outline" size={22} color={C.tx} />
        <Ionicons name="paper-plane-outline" size={22} color={C.tx} />
        <View style={{ flex: 1 }} />
        <Pressable onPress={() => setSaved(!saved)}><Ionicons name={saved ? 'bookmark' : 'bookmark-outline'} size={22} color={saved ? C.cy : C.tx} /></Pressable>
      </View>
    </Glass>
  );
});

function Home({ open }) {
  const [chip, setChip] = useState('All'), [posts, setPosts] = useState(() => rank(Array.from({ length: 12 }, (_, i) => mkPost(i))));
  const [ref_, setRef] = useState(false), [q, setQ] = useState(''), [searching, setSearching] = useState(false);
  const [recent, setRecent] = useState(['#gym', 'boxing club']), [create, setCreate] = useState(false), [priv, setPriv] = useState('Public');
  const data = useMemo(() => posts.filter((p) => chip === 'All' || p.tag === chip), [posts, chip]);
  const more = useCallback(() => setPosts((p) => [...p, ...rank(Array.from({ length: 8 }, (_, i) => mkPost(p.length + i)))]), []);
  const refresh = () => { setRef(true); setTimeout(() => { setPosts(rank(Array.from({ length: 12 }, (_, i) => mkPost(i + 100)))); setRef(false); }, 700); };
  const Header = (
    <View>
      <Pressable onPress={() => open('live')} style={{ margin: 14 }}><LinearGradient colors={['#ff0044', C.pk]} style={s.neon}><Text style={{ color: '#fff', fontWeight: '800' }}>● GO LIVE</Text></LinearGradient></Pressable>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ paddingLeft: 14 }}>
        {['Your story', 'ali', 'sara', 'rafi', 'nila', 'tim'].map((n) => <Ring key={n} label={n} />)}
      </ScrollView>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ margin: 14 }}>
        {CHIPS.map((c) => <Pressable key={c} onPress={() => setChip(c)} style={[s.chip, chip === c && { backgroundColor: C.cy }]}><T style={chip === c && { color: '#000', fontWeight: '700' }}>{c}</T></Pressable>)}
      </ScrollView>
      <Glass style={{ marginHorizontal: 14, marginBottom: 14 }}><T>👥 Groups for you: Iron Club · Night Owls Study</T><T dim>Friend request: @mira · <T style={{ color: C.cy }}>Accept</T></T></Glass>
      <Glass style={{ marginHorizontal: 14, marginBottom: 14 }}><T>🔴 LIVE · @coach_k · 1.2k watching</T></Glass>
    </View>
  );
  return (
    <Screen>
      <Head title="DMM X" right={[<Ionicons key="p" name="add-circle" size={28} color={C.cy} onPress={() => setCreate(true)} />, <Ionicons key="w" name="wallet" size={26} color={C.pk} onPress={() => open('wallet')} />]} />
      <TextInput value={q} onChangeText={setQ} onFocus={() => setSearching(true)} onSubmitEditing={() => { setRecent([q, ...recent].slice(0, 6)); setSearching(false); }} placeholder="Search people, #hashtags, groups" placeholderTextColor={C.dim} style={s.search} />
      {searching ? (
        <ScrollView style={{ padding: 14 }}>
          {['Global', 'Hashtag', 'People', 'Groups'].map((t) => <T key={t} style={{ paddingVertical: 6 }}>🔎 {t}: {q || '…'}</T>)}
          <T dim style={{ marginTop: 12 }}>Recent</T>{recent.map((r, i) => <T key={i} style={{ paddingVertical: 6 }}>🕘 {r}</T>)}
          <Neon label="Close" onPress={() => setSearching(false)} style={{ marginTop: 14 }} />
        </ScrollView>
      ) : (
        <FlatList data={data} keyExtractor={(p) => p.id} renderItem={({ item }) => <Post p={item} />} ListHeaderComponent={Header}
          onEndReached={more} onEndReachedThreshold={0.6} refreshing={ref_} onRefresh={refresh} windowSize={7} initialNumToRender={4} removeClippedSubviews />
      )}
      <Modal visible={create} transparent animationType="slide">
        <View style={s.sheet}><Glass>
          <T style={s.h1}>Create post</T>
          <TextInput multiline placeholder="What's on your mind?" placeholderTextColor={C.dim} style={[s.search, { height: 90, margin: 0, marginVertical: 10 }]} />
          <View style={s.wrap}>{['Text', 'Photo', 'Video', 'Live', 'Poll', 'Event'].map((k) => <View key={k} style={s.chip}><T>{k}</T></View>)}</View>
          <View style={s.wrap}>{['Public', 'Friends', 'Only me'].map((k) => <Pressable key={k} onPress={() => setPriv(k)} style={[s.chip, priv === k && { backgroundColor: C.pk }]}><T>{k}</T></Pressable>)}</View>
          <Neon label="Post" onPress={() => setCreate(false)} />
        </Glass></View>
      </Modal>
    </Screen>
  );
}

/* ---------- 2. REELS (+ camera → pending_review) ---------- */
const REEL_CATS = ['Gym', 'Study', 'Boxing', 'KungFu', 'Daily Routine'];
const REELS = Array.from({ length: 15 }, (_, i) => ({ id: 'r' + i, cat: REEL_CATS[i % 5], user: 'creator' + i, cap: 'Day ' + i + ' no excuses', tag: '#' + REEL_CATS[i % 5].replace(' ', ''), sound: 'Phonk Drive' }));
const Reel = memo(({ r, h }) => {
  const [liked, setLiked] = useState(false), [form, setForm] = useState(false);
  return (
    <LinearGradient colors={['#071a22', '#220a2a', '#07060D']} style={{ height: h, justifyContent: 'flex-end' }}>
      {r.cat === 'Gym' && <Pressable onPress={() => setForm(!form)} style={s.formBtn}><T style={{ color: C.cy }}>{form ? 'Form: 92% ✓ knees ok · back straight' : '🤖 AI Form Check'}</T></Pressable>}
      <View style={{ position: 'absolute', right: 12, bottom: 120, gap: 20, alignItems: 'center' }}>
        <Ionicons name={liked ? 'heart' : 'heart-outline'} size={32} color={liked ? C.pk : '#fff'} onPress={() => setLiked(!liked)} />
        {['chatbubble-outline', 'arrow-redo-outline', 'bookmark-outline', 'people-outline', 'shuffle-outline'].map((n) => <Ionicons key={n} name={n} size={28} color="#fff" />)}
      </View>
      <View style={{ padding: 16, paddingBottom: 90, width: '75%' }}>
        <T style={{ fontWeight: '800' }}>@{r.user}</T><T>{r.cap}</T><T style={{ color: C.cy }}>{r.tag}</T><T dim>♪ {r.sound}</T>
      </View>
    </LinearGradient>
  );
});
function Reels({ open }) {
  const [h, setH] = useState(H - 80), [cat, setCat] = useState('All');
  const data = REELS.filter((r) => cat === 'All' || r.cat === cat);
  return (
    <Screen>
      <View onLayout={(e) => setH(e.nativeEvent.layout.height)} style={{ flex: 1 }}>
        <FlatList data={data} keyExtractor={(r) => r.id} pagingEnabled snapToInterval={h} decelerationRate="fast" showsVerticalScrollIndicator={false}
          renderItem={({ item }) => <Reel r={item} h={h} />} getItemLayout={(_, i) => ({ length: h, offset: h * i, index: i })} windowSize={3} maxToRenderPerBatch={2} removeClippedSubviews />
        <View style={s.reelTop}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>{['All', ...REEL_CATS].map((c) => <Pressable key={c} onPress={() => setCat(c)} style={[s.chip, cat === c && { backgroundColor: C.cy }]}><T style={cat === c && { color: '#000' }}>{c}</T></Pressable>)}</ScrollView>
        </View>
        <View style={{ position: 'absolute', top: 60, right: 14, gap: 12 }}>
          <Ionicons name="videocam" size={28} color={C.cy} onPress={() => open('camera')} />
          <Ionicons name="radio" size={28} color={C.pk} onPress={() => open('live')} />
        </View>
      </View>
    </Screen>
  );
}

/* Camera: asks permission, records, compresses, uploads to pending_review */
function CameraScreen({ close }) {
  const [perm, req] = useCameraPermissions(), [mic, reqMic] = useMicrophonePermissions();
  const cam = useRef(null);
  const [rec, setRec] = useState(false), [busy, setBusy] = useState(false), [speed, setSpeed] = useState(1), [timer, setTimer] = useState(0), [beauty, setBeauty] = useState(false);
  if (!perm?.granted || !mic?.granted) return (
    <Screen><View style={s.center}>
      <T style={s.h1}>Allow camera to create reels</T>
      <Neon label="Allow" onPress={async () => { await req(); await reqMic(); await MediaLibrary.requestPermissionsAsync(); }} style={{ marginTop: 16 }} />
      <Pressable onPress={close}><T dim style={{ marginTop: 16 }}>Not now</T></Pressable>
    </View></Screen>);
  const start = async () => {
    if (timer) await new Promise((r) => setTimeout(r, timer * 1000));
    setRec(true);
    const v = await cam.current.recordAsync({ maxDuration: 60 });
    setRec(false); setBusy(true);
    try {
      const small = await Compress.compress(v.uri, { compressionMethod: 'auto' });
      const blob = await (await fetch(small)).blob();
      const path = `pending_review/${ME.uid}/${Date.now()}.mp4`;
      await uploadBytes(ref(storage, path), blob);
      await addDoc(collection(db, 'pending_uploads'), { uid: ME.uid, user: ME.name, path, status: 'pending', createdAt: serverTimestamp() });
      Alert.alert('Sent for review', 'Your video will appear once approved.');
    } catch (e) { Alert.alert('Upload failed', String(e.message || e)); }
    setBusy(false); close();
  };
  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <CameraView ref={cam} style={{ flex: 1 }} mode="video" facing="front" />
      <View style={s.camBar}>
        <Pressable onPress={() => setSpeed(speed === 1 ? 2 : speed === 2 ? 0.5 : 1)}><T>{speed}x</T></Pressable>
        <Pressable onPress={() => setTimer(timer ? 0 : 3)}><T>⏱{timer || 'off'}</T></Pressable>
        <Pressable onPress={() => setBeauty(!beauty)}><T style={beauty && { color: C.pk }}>✨Beauty</T></Pressable>
        <T>🎵 Music</T>
      </View>
      <Pressable onPress={rec ? () => cam.current.stopRecording() : start} style={s.shutter}>
        {busy ? <ActivityIndicator color={C.cy} /> : <View style={{ width: rec ? 28 : 56, height: rec ? 28 : 56, borderRadius: rec ? 6 : 99, backgroundColor: C.pk }} />}
      </Pressable>
      <Pressable onPress={close} style={{ position: 'absolute', top: 50, left: 16 }}><Ionicons name="close" size={30} color="#fff" /></Pressable>
    </View>
  );
}

/* ---------- ADMIN PANEL ---------- */
function AdminPanel({ close }) {
  const [items, setItems] = useState([]), [urls, setUrls] = useState({});
  useEffect(() => onSnapshot(query(collection(db, 'pending_uploads'), where('status', '==', 'pending'), orderBy('createdAt', 'desc')), (snap) => setItems(snap.docs.map((d) => ({ id: d.id, ...d.data() })))), []);
  if (ME.email !== ADMIN_EMAIL) return <Screen><View style={s.center}><T>Access denied</T></View></Screen>;
  const approve = async (it) => {
    try { // move to public: copy blob, delete original
      const blob = await getBlob(ref(storage, it.path));
      const dest = `public/${it.id}.mp4`;
      await uploadBytes(ref(storage, dest), blob);
      await deleteObject(ref(storage, it.path));
      await updateDoc(doc(db, 'pending_uploads', it.id), { status: 'approved', publicUrl: await getDownloadURL(ref(storage, dest)) });
    } catch (e) { Alert.alert('Error', String(e.message)); }
  };
  const reject = (it, del) => Alert.prompt ? Alert.prompt(del ? 'Delete reason' : 'Reject reason', '', async (reason) => {
    if (del) { await deleteObject(ref(storage, it.path)).catch(() => {}); await deleteDoc(doc(db, 'pending_uploads', it.id)); }
    else await updateDoc(doc(db, 'pending_uploads', it.id), { status: 'rejected', reason });
  }) : updateDoc(doc(db, 'pending_uploads', it.id), { status: 'rejected', reason: 'Policy' });
  return (
    <Screen>
      <Head title="Admin · Pending" right={[<Ionicons key="x" name="close" size={28} color={C.tx} onPress={close} />]} />
      <FlatList data={items} numColumns={2} keyExtractor={(i) => i.id} ListEmptyComponent={<T dim style={{ textAlign: 'center', marginTop: 40 }}>Nothing pending</T>}
        renderItem={({ item }) => (
          <Glass style={{ flex: 1, margin: 6 }}>
            <LinearGradient colors={['#102a2a', '#2a1030']} style={{ height: 120, borderRadius: 10, alignItems: 'center', justifyContent: 'center' }}><Ionicons name="play" size={32} color={C.cy} /></LinearGradient>
            <T style={{ marginVertical: 6 }}>@{item.user}</T>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <Ionicons name="checkmark-circle" size={28} color={C.cy} onPress={() => approve(item)} />
              <Ionicons name="close-circle" size={28} color={C.pk} onPress={() => reject(item, false)} />
              <Ionicons name="trash" size={26} color="#ff4466" onPress={() => reject(item, true)} />
            </View>
          </Glass>)} />
    </Screen>
  );
}

/* ---------- 3. MESSENGER ---------- */
const CHATS = [{ id: 1, n: 'Ali', last: 'gym at 6?', t: 'chat', on: true }, { id: 2, n: 'Iron Club', last: '200k members', t: 'group' }, { id: 3, n: 'DMM News', last: 'New update 3.2', t: 'channel' }, { id: 4, n: 'Secret · Sara', last: '🔒 encrypted', t: 'secret' }];
function Chat({ chat, back }) {
  const [msgs, setMsgs] = useState([{ id: 1, me: false, text: 'gym at 6?', ts: '✓✓' }]), [txt, setTxt] = useState(''), [typing, setTyping] = useState(false), [ttl, setTtl] = useState('off'), [tools, setTools] = useState(false);
  const send = (t = txt) => { if (!t.trim()) return; setMsgs((m) => [...m, { id: Date.now(), me: true, text: t, ts: '✓✓' }]); setTxt(''); setTyping(true); setTimeout(() => { setTyping(false); setMsgs((m) => [...m, { id: Date.now() + 1, me: false, text: 'Sounds good 💪' }]); }, 1200); };
  const edit = (m) => Alert.alert('Message', m.text, [{ text: 'Delete', style: 'destructive', onPress: () => setMsgs((x) => x.filter((y) => y.id !== m.id)) }, { text: '❤️ React', onPress: () => setMsgs((x) => x.map((y) => y.id === m.id ? { ...y, r: '❤️' } : y)) }, { text: 'Cancel' }]);
  const TTL = ['off', '5s', '1h', '1d', '1w'];
  return (
    <Screen>
      <Head title={chat.n} right={[<Ionicons key="c" name="call" size={22} color={C.cy} />, <Ionicons key="v" name="videocam" size={24} color={C.cy} />, <Ionicons key="b" name="arrow-back" size={24} color={C.tx} onPress={back} />]} />
      <T dim style={{ textAlign: 'center' }}>{chat.on ? 'online' : 'last seen recently'} · timer {ttl}</T>
      <FlatList data={msgs} keyExtractor={(m) => String(m.id)} contentContainerStyle={{ padding: 14 }} renderItem={({ item }) => (
        <Pressable onLongPress={() => edit(item)} style={{ alignSelf: item.me ? 'flex-end' : 'flex-start', marginBottom: 8, maxWidth: '78%' }}>
          <LinearGradient colors={item.me ? NEON : ['#241f3d', '#241f3d']} style={{ padding: 10, borderRadius: 16 }}>
            <Text style={{ color: item.me ? '#000' : C.tx }}>{item.text}</Text><Text style={{ fontSize: 10, color: item.me ? '#000' : C.dim, alignSelf: 'flex-end' }}>{item.r} {item.ts && <Text style={{ color: item.me ? '#003' : C.cy }}>{item.ts}</Text>}</Text>
          </LinearGradient></Pressable>)} />
      {typing && <T dim style={{ marginLeft: 16 }}>typing…</T>}
      <ScrollView horizontal style={{ maxHeight: 40 }}>{['Sure!', 'Translate 🌐', 'Summarize 📝', 'Suggest reply ✨'].map((x) => <Pressable key={x} onPress={() => send(x.replace(/ .$/, ''))} style={s.chip}><T>{x}</T></Pressable>)}</ScrollView>
      {tools && <View style={s.wrap}>{['📎 File 2GB', '📍 Location', '📊 Poll', '👤 Contact', '🎮 Game', '😀 Sticker'].map((x) => <View key={x} style={s.chip}><T>{x}</T></View>)}
        {TTL.map((x) => <Pressable key={x} onPress={() => setTtl(x)} style={[s.chip, ttl === x && { backgroundColor: C.pk }]}><T>⏳{x}</T></Pressable>)}</View>}
      <View style={s.inputRow}>
        <Ionicons name="add-circle" size={30} color={C.cy} onPress={() => setTools(!tools)} />
        <TextInput value={txt} onChangeText={setTxt} placeholder="Message" placeholderTextColor={C.dim} style={[s.search, { flex: 1, margin: 0 }]} />
        <Ionicons name="send" size={26} color={C.pk} onPress={() => send()} />
      </View>
    </Screen>
  );
}
function Messenger() {
  const [chat, setChat] = useState(null);
  if (chat) return <Chat chat={chat} back={() => setChat(null)} />;
  return (<Screen><Head title="Messages" />
    <FlatList data={CHATS} keyExtractor={(c) => String(c.id)} renderItem={({ item }) => (
      <Pressable onPress={() => setChat(item)}><Glass style={{ marginHorizontal: 14, marginBottom: 10 }}><T style={{ fontWeight: '700' }}>{item.n} <Ionicons name="checkmark-done" color={C.cy} /> </T><T dim>{item.last}</T></Glass></Pressable>)} /></Screen>);
}

/* ---------- 4. GAMES ---------- */
const OFFLINE = ['Chess', 'Snake', 'Sudoku', '2048', 'Ludo', 'TicTacToe', 'Flappy Bird', 'Brick Breaker', 'Word Puzzle', 'Memory Match', 'Car Race', 'Fruit Ninja'];
function TicTacToe({ back }) {
  const [b, setB] = useState(Array(9).fill(null)), [x, setX] = useState(true);
  const L = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
  const w = L.find(([a, c, d]) => b[a] && b[a] === b[c] && b[a] === b[d]);
  const tap = (i) => { if (b[i] || w) return; const n = [...b]; n[i] = x ? 'X' : 'O'; setB(n); setX(!x); };
  return (<Screen><Head title="TicTacToe" right={[<Ionicons key="b" name="arrow-back" size={26} color={C.tx} onPress={back} />]} />
    <T style={{ textAlign: 'center', fontSize: 18 }}>{w ? `${b[w[0]]} wins! +50 coins` : `Turn: ${x ? 'X' : 'O'}`}</T>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', width: 300, alignSelf: 'center', marginTop: 20 }}>
      {b.map((v, i) => <Pressable key={i} onPress={() => tap(i)} style={s.cell}><T style={{ fontSize: 40, color: v === 'X' ? C.cy : C.pk }}>{v}</T></Pressable>)}</View>
    <Neon label="Restart" onPress={() => { setB(Array(9).fill(null)); setX(true); }} style={{ margin: 20 }} /></Screen>);
}
function Games() {
  const [g, setG] = useState(null), [tab, setTab] = useState('Daily'), [spun, setSpun] = useState(null);
  if (g === 'TicTacToe') return <TicTacToe back={() => setG(null)} />;
  return (<Screen><Head title="Games" /><ScrollView>
    <Glass style={{ margin: 14 }}><T>Lv 12 · 4,820 XP</T>
      <Neon label={spun ? `Won ${spun} coins!` : '🎁 Daily Reward Spin'} onPress={() => setSpun([10, 20, 50, 100][Math.floor(Math.random() * 4)])} style={{ marginTop: 8 }} /></Glass>
    <View style={s.wrap}>{OFFLINE.map((n) => <Pressable key={n} onPress={() => n === 'TicTacToe' ? setG(n) : Alert.alert(n, 'Engine slot ready — plug game logic into /games/' + n.replace(/ /g, '') + '.js')} style={s.gameTile}><T style={{ fontWeight: '700' }}>{n}</T></Pressable>)}</View>
    <T style={[s.h2, { marginLeft: 14 }]}>Online</T>
    <View style={s.wrap}>{['♟ 1v1 Chess', '🧠 Quiz Battle', '🏆 Tournament (100c)'].map((n) => <View key={n} style={[s.gameTile, { borderColor: C.pk }]}><T>{n}</T></View>)}</View>
    <View style={s.wrap}>{['Daily', 'Weekly', 'All time'].map((t) => <Pressable key={t} onPress={() => setTab(t)} style={[s.chip, tab === t && { backgroundColor: C.cy }]}><T style={tab === t && { color: '#000' }}>{t}</T></Pressable>)}</View>
    {['rafi 9,200', 'sara 8,150', 'you 7,400'].map((r, i) => <Glass key={r} style={{ marginHorizontal: 14, marginBottom: 6 }}><T>#{i + 1} {r}</T></Glass>)}
    <Glass style={{ margin: 14 }}><T dim>📢 AdMob banner (ca-app-pub-xxx) · Invite a friend = +100 coins</T></Glass>
  </ScrollView></Screen>);
}

/* ---------- 5. LOBBY ---------- */
const COACHES = [['Gym', 'barbell', 4.9, 1200], ['Boxing', 'fitness', 4.8, 900], ['Study', 'book', 4.9, 2100], ['Diet', 'nutrition', 4.7, 800], ['Personal', 'person', 5.0, 300]];
function Lobby() {
  const [tab, setTab] = useState('Coaches'), [todo, setTodo] = useState([['Workout', 1], ['Read 30 min', 0], ['Water 3L', 0]]);
  return (<Screen><Head title="Lobby" />
    <View style={s.wrap}>{['Coaches', 'Personal', 'Group'].map((t) => <Pressable key={t} onPress={() => setTab(t)} style={[s.chip, tab === t && { backgroundColor: C.cy }]}><T style={tab === t && { color: '#000' }}>{t}</T></Pressable>)}</View>
    <ScrollView>
      {tab === 'Coaches' && COACHES.map(([n, ic, r, ses]) => <Glass key={n} style={{ marginHorizontal: 14, marginBottom: 10 }}><View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}><LinearGradient colors={NEON} style={s.avatar}><Ionicons name={ic} size={26} color="#000" /></LinearGradient><View><T style={{ fontWeight: '700' }}>{n} Coach AI</T><T dim>★ {r} · {ses} sessions</T></View></View></Glass>)}
      {tab === 'Personal' && <View style={{ padding: 14 }}><T style={s.h2}>🔥 Streak 14 days</T>
        {todo.map(([t, d], i) => <Pressable key={t} onPress={() => setTodo(todo.map((x, j) => j === i ? [x[0], x[1] ? 0 : 1] : x))}><Glass style={{ marginTop: 8 }}><T>{d ? '☑' : '☐'} {t}</T></Glass></Pressable>)}
        <Glass style={{ marginTop: 12 }}><T dim>Progress (week)</T><View style={{ flexDirection: 'row', alignItems: 'flex-end', height: 80, gap: 8 }}>{[30, 50, 40, 70, 60, 90, 75].map((h, i) => <LinearGradient key={i} colors={NEON} style={{ flex: 1, height: h, borderRadius: 4 }} />)}</View></Glass>
        <Glass style={{ marginTop: 12 }}><T>📁 Upload video/pdf · 📅 Calendar</T></Glass></View>}
      {tab === 'Group' && <View style={{ padding: 14 }}>{['Create Group', 'Join via Invite Link', 'Voice room · 12 online', 'Screen Share', 'Poll', 'Event', 'Announcement'].map((x) => <Glass key={x} style={{ marginBottom: 8 }}><T>{x}</T></Glass>)}
        <T dim>Roles: Admin · Mod · Member | 🤖 AI Moderator auto-deletes bad words</T></View>}
    </ScrollView></Screen>);
}

/* ---------- 6. PROFILE ---------- */
function Profile({ open }) {
  const [tab, setTab] = useState('Posts');
  return (<Screen><ScrollView>
    <LinearGradient colors={NEON} style={{ height: 130 }} />
    <View style={{ marginTop: -40, paddingHorizontal: 14 }}>
      <Ring label="" size={80} />
      <T style={s.h1}>{ME.name} <Ionicons name="checkmark-circle" color={C.cy} size={18} /> <T style={{ color: C.pk, fontSize: 14 }}>Lv {ME.level}</T></T>
      <T dim>Lifting, learning, leveling. · Joined Jan 2025</T>
      <T style={{ marginVertical: 8 }}>12.4k Followers · 380 Following · 8 mutual</T>
      <View style={{ flexDirection: 'row', gap: 10 }}><Neon label="Edit Profile" /><Neon label="QR" icon="qr-code" /><Neon label="Share" icon="share" />
        {ME.email === ADMIN_EMAIL && <Neon label="Admin" icon="shield" onPress={() => open('admin')} />}</View>
      <ScrollView horizontal style={{ marginTop: 14 }}>{['Gym', 'Fights', 'Study'].map((h) => <Ring key={h} label={h} size={48} />)}</ScrollView>
      <View style={s.wrap}>{['Posts', 'Reels', 'Games', 'Lobby'].map((t) => <Pressable key={t} onPress={() => setTab(t)} style={[s.chip, tab === t && { backgroundColor: C.cy }]}><T style={tab === t && { color: '#000' }}>{t}</T></Pressable>)}</View>
      {tab === 'Games' ? <Glass><T>Win rate 64% · 212 games</T></Glass> : tab === 'Lobby' ? <Glass><T>Progress ▁▃▅▆█ · Streak 14</T></Glass> : <View style={s.wrap}>{Array.from({ length: 9 }, (_, i) => <LinearGradient key={i} colors={['#1b2b4a', '#4a1b4a']} style={{ width: '31%', aspectRatio: 1, margin: '1%', borderRadius: 8 }} />)}</View>}
      <T dim style={{ marginVertical: 10 }}>Saved · Archive · Activity status: Active now</T>
    </View></ScrollView></Screen>);
}

/* ---------- 7. SETTINGS ---------- */
function Settings({ open }) {
  const [on, setOn] = useState({ dark: true, priv: false, twofa: true, msg: true, reels: true, games: true, lobby: true, live: true });
  const [lang, setLang] = useState('English'), [cache, setCache] = useState(312);
  const Sw = (k, l) => <View style={s.setRow}><T>{l}</T><Switch value={on[k]} onValueChange={(v) => setOn({ ...on, [k]: v })} trackColor={{ true: C.cy }} /></View>;
  const Sec = (t) => <T style={[s.h2, { marginTop: 16 }]}>{t}</T>;
  return (<Screen><Head title="Settings" /><ScrollView style={{ padding: 14 }}>
    {Sec('Account')}<T dim>Phone · Email · Password · Username change</T>
    {Sec('Privacy')}{Sw('priv', 'Private account / Lock profile')}<T dim>Block list · Who can message: Friends</T>
    {Sec('Security')}{Sw('twofa', 'Two-step verification')}<T dim>Login activity · Active sessions (2)</T>
    {Sec('Appearance')}{Sw('dark', 'Dark mode')}<T dim>Neon theme · Chat wallpaper · Font size</T>
    {Sec('Notifications')}{Sw('msg', 'Messages')}{Sw('reels', 'Reels')}{Sw('games', 'Games')}{Sw('lobby', 'Lobby')}{Sw('live', 'Live')}
    {Sec('Storage')}<View style={{ height: 8, borderRadius: 4, backgroundColor: C.glass }}><LinearGradient colors={NEON} style={{ width: '38%', height: 8, borderRadius: 4 }} /></View>
    <Neon label={`Clear cache (${cache} MB)`} onPress={() => setCache(0)} style={{ marginTop: 8 }} />
    {Sec('Language')}<View style={s.wrap}>{['বাংলা', 'English', 'हिन्दी'].map((l) => <Pressable key={l} onPress={() => setLang(l)} style={[s.chip, lang === l && { backgroundColor: C.pk }]}><T>{l}</T></Pressable>)}</View>
    {Sec('Help')}<T dim>Report problem · Terms · Privacy · Support chat · Feedback</T><T dim>About DMM X v3.2.1</T>
    <Pressable onPress={() => Alert.alert('Log out?', 'You will need to sign in again.', [{ text: 'Cancel' }, { text: 'Log out', style: 'destructive' }])} style={[s.neon, { backgroundColor: '#3a0016', marginVertical: 24 }]}><Text style={{ color: '#ff4466', fontWeight: '800' }}>Log out</Text></Pressable>
  </ScrollView></Screen>);
}

/* ---------- WALLET / LIVE / AI ---------- */
function Wallet({ close }) {
  const [coins, setCoins] = useState(ME.coins);
  return (<Screen><Head title="DMM Wallet" right={[<Ionicons key="x" name="close" size={28} color={C.tx} onPress={close} />]} /><ScrollView style={{ padding: 14 }}>
    <LinearGradient colors={NEON} style={{ borderRadius: 20, padding: 20 }}><Text style={{ fontSize: 34, fontWeight: '900' }}>🪙 {coins}</Text><Text>৳ 540.00</Text></LinearGradient>
    <T style={s.h2}>Add money</T><View style={s.wrap}>{['bKash', 'Nagad', 'Card'].map((m) => <View key={m} style={s.gameTile}><T>{m}</T></View>)}</View>
    <T style={s.h2}>Earn</T>{[['Watch Reels', 10], ['Win Games', 50], ['Daily Login', 20]].map(([l, c]) => <Pressable key={l} onPress={() => setCoins(coins + c)}><Glass style={{ marginTop: 6 }}><T>{l} +{c}</T></Glass></Pressable>)}
    <T style={s.h2}>Spend</T><T dim>Premium Coach 500 · Live gift 10–1000 · Tournament 100</T>
    <T style={s.h2}>History</T><T dim>+20 Daily login · −100 Tournament · +50 Win</T>
    <Neon label="Withdraw" style={{ marginVertical: 20 }} /></ScrollView></Screen>);
}
const GIFTS = [['🌹 Rose', 10], ['💎 Diamond', 200], ['🚀 Rocket', 1000]];
function Live({ close }) {
  const [perm, req] = useCameraPermissions(), [gift, setGift] = useState(null), [msgs, setMsgs] = useState(['ali: 🔥🔥']), [pk, setPk] = useState(false), [earn, setEarn] = useState(0), [end, setEnd] = useState(false);
  if (!perm?.granted) return <Screen><View style={s.center}><Neon label="Allow camera to go live" onPress={req} /></View></Screen>;
  if (end) return <Screen><View style={s.center}><T style={s.h1}>Live ended</T><T>Earned 🪙 {earn} · Peak viewers 1,284</T><Neon label="Done" onPress={close} style={{ marginTop: 20 }} /></View></Screen>;
  return (<View style={{ flex: 1, backgroundColor: '#000' }}>
    <View style={{ flex: 1, flexDirection: pk ? 'row' : 'column' }}><CameraView style={{ flex: 1 }} facing="front" />{pk && <LinearGradient colors={['#220a2a', '#071a22']} style={{ flex: 1 }} />}</View>
    {gift && <Text style={s.gift}>{gift}</Text>}
    <View style={{ position: 'absolute', bottom: 90, left: 12 }}>{msgs.slice(-4).map((m, i) => <T key={i} style={s.liveMsg}>{m}</T>)}</View>
    <View style={s.camBar}>{GIFTS.map(([g, c]) => <Pressable key={g} onPress={() => { setGift(g); setEarn(earn + c); setMsgs([...msgs, `⭐ SUPER ${g} ${c}c`]); setTimeout(() => setGift(null), 1200); }}><T>{g}</T></Pressable>)}
      <Pressable onPress={() => setPk(!pk)}><T style={{ color: C.pk }}>PK</T></Pressable><Pressable onPress={() => setEnd(true)}><T style={{ color: '#ff4466' }}>End</T></Pressable></View></View>);
}
function AIChat({ close }) {
  const [m, setM] = useState([{ me: false, t: 'I am DMM AI. Ask for a gym plan, diet plan, reels, translation, or a post.' }]), [t, setT] = useState('');
  const send = async () => {
    if (!t.trim()) return; const next = [...m, { me: true, t }]; setM(next); setT('');
    // SECURITY: call your own backend (Cloud Function) that holds the OpenAI key. Never ship the key in the app.
    let reply = 'Connect your /api/ai endpoint. Demo: 3-day split — Push, Pull, Legs.';
    try { const r = await fetch('https://YOUR_BACKEND/api/ai', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: next }) }); reply = (await r.json()).reply; } catch {}
    setM([...next, { me: false, t: reply }]);
    addDoc(collection(db, 'ai_chats', ME.uid, 'messages'), { q: t, a: reply, at: serverTimestamp() }).catch(() => {});
  };
  return (<Screen><Head title="DMM AI" right={[<Ionicons key="x" name="close" size={28} color={C.tx} onPress={close} />]} />
    <FlatList data={m} keyExtractor={(_, i) => String(i)} contentContainerStyle={{ padding: 14 }} renderItem={({ item }) => <Glass style={{ marginBottom: 8, alignSelf: item.me ? 'flex-end' : 'flex-start' }}><T>{item.t}</T>{!item.me && <Ionicons name="volume-high" size={16} color={C.cy} onPress={() => Speech.speak(item.t)} />}</Glass>} />
    <View style={s.inputRow}><TextInput value={t} onChangeText={setT} placeholder="Ask DMM AI" placeholderTextColor={C.dim} style={[s.search, { flex: 1, margin: 0 }]} /><Ionicons name="send" size={26} color={C.pk} onPress={send} /></View></Screen>);
}

/* ---------- ROOT ---------- */
const Tab = createBottomTabNavigator();
const ICONS = { Home: 'home', Reels: 'play-circle', Chat: 'chatbubbles', Games: 'game-controller', Lobby: 'people-circle', Profile: 'person', Settings: 'settings' };
export default function App() {
  const [ov, setOv] = useState(null);
  const open = useCallback(setOv, []);
  const wrap = (C_) => (p) => <C_ {...p} open={open} />;
  return (
    <NavigationContainer theme={{ ...DarkTheme, colors: { ...DarkTheme.colors, background: C.bg } }}>
      <StatusBar barStyle="light-content" />
      <Tab.Navigator screenOptions={({ route }) => ({
        headerShown: false, lazy: true, tabBarShowLabel: false, tabBarActiveTintColor: C.cy, tabBarInactiveTintColor: C.dim,
        tabBarStyle: { position: 'absolute', backgroundColor: 'rgba(12,10,24,0.85)', borderTopColor: C.line, height: 62 },
        tabBarIcon: ({ color, focused }) => <Ionicons name={ICONS[route.name] + (focused ? '' : '-outline')} size={focused ? 28 : 24} color={focused ? (['Reels','Games','Profile'].includes(route.name) ? C.pk : C.cy) : color} />,
      })}>
        <Tab.Screen name="Home" component={wrap(Home)} /><Tab.Screen name="Reels" component={wrap(Reels)} /><Tab.Screen name="Chat" component={Messenger} />
        <Tab.Screen name="Games" component={Games} /><Tab.Screen name="Lobby" component={Lobby} /><Tab.Screen name="Profile" component={wrap(Profile)} /><Tab.Screen name="Settings" component={wrap(Settings)} />
      </Tab.Navigator>
      {/* Floating neon AI button on all 7 screens */}
      <Pressable onPress={() => setOv('ai')} style={s.fab}><LinearGradient colors={NEON} style={s.fabIn}><Ionicons name="sparkles" size={24} color="#000" /></LinearGradient></Pressable>
      <Modal visible={!!ov} animationType="slide" onRequestClose={() => setOv(null)}>
        {ov === 'camera' && <CameraScreen close={() => setOv(null)} />}
        {ov === 'admin' && <AdminPanel close={() => setOv(null)} />}
        {ov === 'wallet' && <Wallet close={() => setOv(null)} />}
        {ov === 'live' && <Live close={() => setOv(null)} />}
        {ov === 'ai' && <AIChat close={() => setOv(null)} />}
      </Modal>
    </NavigationContainer>
  );
}

const s = SS.create({
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingTop: 54, paddingBottom: 10 },
  h1: { fontSize: 24, fontWeight: '900', color: C.tx }, h2: { fontSize: 17, fontWeight: '800', color: C.cy, marginVertical: 8 },
  neon: { flexDirection: 'row', paddingVertical: 12, paddingHorizontal: 18, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  search: { backgroundColor: C.glass, borderColor: C.line, borderWidth: 1, borderRadius: 14, color: C.tx, marginHorizontal: 14, paddingHorizontal: 14, paddingVertical: 10 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 99, borderWidth: 1, borderColor: C.line, marginRight: 8, marginBottom: 8 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', padding: 10 }, row: { flexDirection: 'row', gap: 18, marginTop: 10, alignItems: 'center' },
  media: { height: 180, borderRadius: 12 }, poll: { borderWidth: 1, borderColor: C.line, borderRadius: 10, padding: 10, marginTop: 6 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }, sheet: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.6)' },
  reelTop: { position: 'absolute', top: 50, left: 10, right: 60 }, formBtn: { position: 'absolute', top: 120, left: 14, padding: 10, borderRadius: 12, backgroundColor: 'rgba(0,255,255,0.12)', borderWidth: 1, borderColor: C.cy },
  camBar: { position: 'absolute', bottom: 120, left: 0, right: 0, flexDirection: 'row', justifyContent: 'space-around' },
  shutter: { position: 'absolute', bottom: 36, alignSelf: 'center', width: 76, height: 76, borderRadius: 99, borderWidth: 4, borderColor: C.cy, alignItems: 'center', justifyContent: 'center' },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, paddingBottom: 80 },
  cell: { width: 100, height: 100, borderWidth: 1, borderColor: C.cy, alignItems: 'center', justifyContent: 'center' },
  gameTile: { width: '30%', margin: '1.5%', paddingVertical: 22, alignItems: 'center', borderRadius: 14, borderWidth: 1, borderColor: C.cy, backgroundColor: C.glass },
  avatar: { width: 54, height: 54, borderRadius: 99, alignItems: 'center', justifyContent: 'center' },
  setRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6 },
  fab: { position: 'absolute', right: 16, bottom: 82 }, fabIn: { width: 52, height: 52, borderRadius: 99, alignItems: 'center', justifyContent: 'center', shadowColor: C.cy, shadowOpacity: 0.9, shadowRadius: 14, elevation: 10 },
  gift: { position: 'absolute', alignSelf: 'center', top: H / 3, fontSize: 80 }, liveMsg: { backgroundColor: 'rgba(0,0,0,0.5)', padding: 4, borderRadius: 8, marginTop: 2 },
});
