# ⚽ Výsledkomat · Mini Fotbalgolf

Mobilní mini hra fotbalgolfu (HTML5 canvas, bez závislostí). Hraje se 18 jamek, celkový **PAR 54** (přední devítka PAR 2 na jamku, zadní PAR 4).
Hra je v barvách a s logem aplikace **Výsledkomat**. Za výsledek **pod PAR** a za hole-in-one hráči získávají
**mince**, které hra posílá do aplikace.

| Soubor | Co to je |
|---|---|
| `index.html` | Hra (načítá `game.css` a `game.js`) |
| `game.js` | Herní logika, fyzika, kreslení, most do aplikace |
| `game.css` | Vzhled |
| `assets/logo.png` | logo Výsledkomatu (horní lišta, menu, trávník, sdílený obrázek) |
| `assets/coin.png` | mince – měna odměn (ikony, animace, sdílený obrázek) |
| `demo-app.html` | Ukázková „aplikace“ – ukazuje celé napojení odměn včetně ověření |

Spuštění lokálně: `python3 -m http.server` a otevřít `http://localhost:8000/` (hra) nebo
`http://localhost:8000/demo-app.html` (ukázka napojení).

---

## Co je nového oproti v1

**Vzhled**
- Ostré vykreslení na všech displejích (retina), hřiště se vždy celé vejde a kruhy jsou opravdu kulaté.
- Posekaný trávník s pruhy, dřevěné mantinely, stíny, keře a stromy kolem hřiště, kytičky.
- Míč se při pohybu otáčí a táhne za sebou stopu; jamka s vlající vlajkou; konfety při trefě.
- Nové UI: banner s názvem jamky, PAR v horní liště, animované hlášky (BIRDIE, EAGLE, HOLE IN ONE…),
  výsledková karta po jamkách, osobní rekord, zvuky (lze vypnout 🔊) a vibrace.
- Hra běží stejně rychle na 60 Hz i 120 Hz telefonech (dřív byla na 120 Hz 2× rychlejší).

**Nové překážky a jamky**

| # | Jamka | PAR | Překážky |
|---|---|---|---|
| 1 | Kopec | 2 | jamka za strmým kopcem, za ní voda – slabá rána sjede zpátky, silná skončí ve vodě, rozhoduje síla |
| 2 | Pískoviště | 2 | bunkr s pískem (brzdí), pneumatiky (odráží), balík sena |
| 3 | Rybníček | 2 | dvě jezírka křížem – **voda = +1 trestný úder** a návrat na místo úderu |
| 4 | Mlýnek | 2 | otáčivý mlýnek, ramena až ke krajům zúžené pasáže – nutno časovat |
| 5 | Zatáčka | 2 | L-zatáčka, urychlovací pás, odrazový bumper, pneumatiky před jamkou |
| 6 | Posuvné brány | 2 | dvě pohyblivé závory + kužely |
| 7 | Kopečky | 2 | tři široké kopce přes celou šířku, které míč odklánějí, krtince |
| 8 | Lesík | 2 | Z-zatáčka, stromy, kláda, bunkr |
| 9 | Most přes potok | 2 | vodní příkop s mostem, urychlovač, trojice bumperů, balíky sena |

**Zadní devítka (těžší – víc zatáček, voda a mosty)**

| # | Jamka | PAR | Překážky |
|---|---|---|---|
| 10 | Rozcestník | 4 | L-zatáčka podle náčrtku: cedule v rohu, sloupek, čtyři klády před jamkou |
| 11 | Ohrady | 4 | podle náčrtku: slalom mezi třemi dřevěnými ohradami |
| 12 | Sedmička | 4 | podle náčrtku: zakřivená dráha, dvě ohrady, kameny a balík sena |
| 13 | Dva mosty | 4 | šikmá řeka – bezpečný most vpravo, riskantní úzká zkratka vlevo |
| 14 | Hadí stezka | 4 | esíčko, tůňky ve vnějších obloucích, bunkr u jamky (nejtěžší jamka) |
| 15 | Ostrov | 4 | jamka na ostrově, přístup jen po mostě, před ním mlýnek |
| 16 | Otočka | 4 | nahoru přes posuvnou závoru, otočka kolem přepážky, dolů přes most |
| 17 | Serpentina | 4 | tři patra tam a zpátky, most přes tůň, bunkr v zatáčce, branka z pneumatik |
| 18 | Velké finále | 4 | dva potoky, mosty na opačných stranách, bunkr mezi nimi |

Okno pro hole-in-one z odpaliště je na zadní devítce pod 1 % všech kombinací směru a síly.

Na každou jamku je limit **PAR + 4 úderů, nejméně však 6** – pokud míč nepadne, jamka se zapíše o úder víc a hra pokračuje.

---

## Odměny

Výchozí nastavení (vše se dá změnit z aplikace):

| Za co | Odměna |
|---|---|
| Dohrání všech 18 jamek | bez odměny (`completion: 0`) |
| Celkový výsledek **pod PAR** (méně než 54 úderů) | +2 mince |
| Navíc za každý úder pod PAR | bez odměny (`perStrokeUnderPar: 0`) |
| Každá jamka na 1 úder (hole-in-one) | +1 mince |

Položky s hodnotou `0` se ve hře vůbec nezobrazují. Když hráč nezíská nic, uvidí na konci výzvu
„zahraj pod PAR a získej +2 🪙“.

Hra odměny jen **spočítá a zobrazí**. Skutečné připsání dělá aplikace / server po přijetí události
`game_complete`. Když hra neběží v aplikaci (např. na webu), ukáže hláška „Odměny se připisují jen při hraní
v aplikaci“.

> ⚠️ **Bezpečnost:** cokoliv běží v prohlížeči, může hráč upravit. Odměnu proto vždy **spočítej znovu na serveru**
> z hodnot `holes[].strokes` a nevěř poli `rewards`. Doporučené kontroly:
> - `nonce` – jednorázový token, který server vydá před hrou a přijme jen jednou,
> - 18 jamek, `par` sedí s tabulkou `[2,2,2,2,2,2,2,2,2, 4,4,4,4,4,4,4,4,4]`, `strokes` je celé číslo 1 až max(PAR+5, 7),
> - `durationMs` není nesmyslně krátké (např. < 72 s),
> - denní limit odměn na hráče.
>
> Hotová ukázka těchto kontrol je ve funkci `serverValidateAndCredit` v `demo-app.html`.

---

## Napojení na aplikaci

### 1. Nastavení hry

Tři možnosti (lze kombinovat):

**a) URL parametry** – `index.html?app=1&user=123&name=Tomáš&nonce=abc&close=1`

| Parametr | Význam |
|---|---|
| `app=1` | hra běží v aplikaci → odměny se odesílají |
| `user`, `name` | ID a jméno hráče (jméno se zobrazí v menu) |
| `nonce` | jednorázový token pro tuto hru |
| `close=1` | zobrazí tlačítko ✕ (pošle událost `close`) |
| `origin` | origin rodičovské stránky (iframe) – zprávy se pak posílají/přijímají jen od ní |

**b) Zpráva `init`** (doporučeno) – aplikace ji pošle po události `ready`:

```js
{ type: 'init', config: {
    playerName: 'Tomáš', userId: '123', nonce: 'jednorazovy-token',
    appName: 'aplikaci Výsledkomat',
    brand: { name: 'Výsledkomat', logo: 'assets/logo.png' },
    currency: { name: 'mincí', forms: ['mince', 'mince', 'mincí'], image: 'assets/coin.png' },
    website: 'www.vysledkomat.cz',   // volitelné – zobrazí se v menu a na sdíleném obrázku
    courseLogo: true,                // logo namalované na trávníku
    rewards: { completion: 0, underPar: 2, perStrokeUnderPar: 0, holeInOne: 1 },
    rewardsEnabled: true,
    rewardNotice: '',            // např. 'Dnešní odměnu už máš – hraj pro radost!'
    showCloseButton: true,
    ballImage: ''                    // obrázek na míčku (prázdné = fotbalový míč)
} }
```

**c) Globální objekt** před načtením `game.js`: `<script>window.FOTBALGOLF_CONFIG = { ... }</script>`

### 2. Události ze hry → aplikace

Každá zpráva má `source: 'fotbalgolf'`, `version`, `type`, `runId`, `userId`, `nonce`, `ts`.

| `type` | Kdy | Data navíc |
|---|---|---|
| `ready` | hra se načetla | `totalPar`, `holes[]`, `rewards` |
| `game_start` | hráč začal hru | `totalPar`, `holes` |
| `hole_complete` | dokončená jamka | `hole`, `name`, `par`, `strokes`, `holeInOne`, `pickedUp`, `scoreToPar` |
| `game_complete` | **konec hry → připsat odměnu** | viz níže |
| `share` | hráč sdílí výsledek | `method`, `text`, případně `imageDataUrl` (PNG) – když sdílení neumí WebView, nasdílej obrázek nativně |
| `close` | hráč klikl na ✕ / „Zpět do aplikace“ | `state` |

Ukázka `game_complete`:

```json
{
  "source": "fotbalgolf", "type": "game_complete", "version": "2.0.0",
  "runId": "1fe4…", "userId": "123", "nonce": "jednorazovy-token",
  "startedAt": 1791358959949, "finishedAt": 1791359079997, "durationMs": 120048,
  "completed": true, "totalStrokes": 51, "totalPar": 54, "scoreToPar": -3, "underPar": true,
  "holesInOne": 1,
  "holes": [ { "hole": 1, "name": "Rozcvička", "par": 2, "strokes": 1, "holeInOne": true, "pickedUp": false }, … ],
  "rewards": { "currency": { "name": "mincí", "image": "assets/coin.png" }, "total": 3,
               "items": [ { "id": "under_par", "label": "Výsledek pod PAR (51 < 54)", "amount": 2 },
                          { "id": "hole_in_one", "label": "Hole-in-one (1×)", "amount": 1 } ] },
  "isPersonalRecord": true
}
```

### 3. Odpověď aplikace → hra

Po připsání pošli zpět (hráč uvidí „✅ Připsáno +3 🪙 · Zůstatek: 12 🪙“):

```js
{ type: 'reward_result', ok: true, credited: 3, balance: 12 }
// nebo při chybě / limitu:
{ type: 'reward_result', ok: false, message: 'Dnešní odměnu už máš – zítra zas!' }
```

Pokud odpověď nepřijde do 6 s, hra ukáže „Výsledek byl odeslán do aplikace“.
Před další hrou pošli nový `nonce` přes `{ type: 'init', config: { nonce: '…' } }`.

### Konkrétní platformy

Hra posílá události všemi kanály najednou, takže stačí poslouchat ten svůj.

**Web (iframe)**
```html
<iframe id="game" src="https://tvuj-web.cz/fotbalgolf/index.html?app=1" style="width:100%;height:100vh;border:0"></iframe>
<script>
  const game = document.getElementById('game');
  window.addEventListener('message', (e) => {
    const m = e.data;
    if (!m || m.source !== 'fotbalgolf') return;
    if (m.type === 'ready') game.contentWindow.postMessage({ type: 'init', config: { userId: '123', nonce: '…' } }, '*');
    if (m.type === 'game_complete') {
      fetch('/api/fotbalgolf/reward', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(m) })
        .then((r) => r.json())
        .then((res) => game.contentWindow.postMessage({ type: 'reward_result', ...res }, '*'));
    }
  });
</script>
```

**React Native (`react-native-webview`)**
```jsx
<WebView
  ref={webRef}
  source={{ uri: 'https://tvuj-web.cz/fotbalgolf/index.html?app=1&close=1' }}
  onMessage={async (e) => {
    const m = JSON.parse(e.nativeEvent.data);
    if (m.type === 'ready') webRef.current.injectJavaScript(`window.Fotbalgolf.init(${JSON.stringify({ userId, nonce, playerName })}); true;`);
    if (m.type === 'game_complete') {
      const res = await api.post('/fotbalgolf/reward', m);   // server ověří a připíše
      webRef.current.injectJavaScript(`window.Fotbalgolf.rewardResult(${JSON.stringify(res)}); true;`);
    }
    if (m.type === 'close') navigation.goBack();
  }}
/>
```

**Flutter (`webview_flutter`)** – kanál `FotbalgolfNative`:
```dart
controller
  ..addJavaScriptChannel('FotbalgolfNative', onMessageReceived: (msg) async {
      final m = jsonDecode(msg.message);
      if (m['type'] == 'game_complete') {
        final res = await api.reward(m);
        controller.runJavaScript('window.Fotbalgolf.rewardResult(${jsonEncode(res)})');
      }
  })
  ..loadRequest(Uri.parse('https://tvuj-web.cz/fotbalgolf/index.html?app=1'));
```

**Android (WebView)** – `webView.addJavascriptInterface(obj, "FotbalgolfNative")`, kde `obj` má metodu
`@JavascriptInterface fun postMessage(json: String)`. Odpověď: `webView.evaluateJavascript("window.Fotbalgolf.rewardResult({...})", null)`.

**iOS (WKWebView)** – `userContentController.add(self, name: "fotbalgolf")`, zprávy chodí do
`userContentController(_:didReceive:)`. Odpověď: `webView.evaluateJavaScript("window.Fotbalgolf.rewardResult({...})")`.

### JS API ve hře

| Volání | Co dělá |
|---|---|
| `window.Fotbalgolf.init(config)` | stejné jako zpráva `init` |
| `window.Fotbalgolf.rewardResult({ok, credited, balance, message})` | stejné jako zpráva `reward_result` |
| `window.Fotbalgolf.start()` | spustí novou hru |
| `window.Fotbalgolf.getState()` | aktuální stav (jamka, údery, skóre) |

Pro hostitelskou webovou stránku (bez iframe) je k dispozici i událost `window.addEventListener('fotbalgolf', e => e.detail)`.

---

## Úprava jamek

Jamky jsou v poli `HOLES` v `game.js`. Hřiště má rozměr 100 × 160 jednotek, okraj obvykle `8…92 × 8…152`.

```js
{ name: 'Moje jamka', par: 3,
  poly: [[8,8],[92,8],[92,152],[8,152]],      // obrys hřiště (mantinely)
  tee: [50,142], cup: [50,22],                // odpaliště a jamka
  zones: [ { t:'sand', shape:'rect', x:20, y:60, w:60, h:20, r:8 } ],
  obs:   [ { t:'tyre', x:30, y:100, r:5 } ] }
```

- **Zóny** (`zones`): `sand` (brzdí), `water` (trestný úder), `hill` (`x,y,r,k` nebo protáhlý `x,y,rx,ry,k` – kopec), `boost` (`dir:[0,-1]` – urychlovač),
  `bridge` (most – na něm míč do vody nespadne, `dir:'h'` = vodorovný), `island` (ostrov uprostřed vody).
  Tvar `shape: 'rect'` (`x,y,w,h,r`), `'ellipse'` (`x,y,rx,ry`) nebo `'poly'` (`pts:[[x,y],…]`, např. šikmá řeka).
- **Překážky** (`obs`): `cone`, `tyre`, `hay`, `rock`, `tree`, `molehill`, `bumper` (`x,y,r`), `log` / `rail` / `fence` (ohrada) / `board` (cedule) (`a:[x,y], b:[x,y], r`),
  `spinner` (`x,y,len,arms,r,w`), `slider` (`y,cx,amp,half,r,w,ph`).

- **Tvar hřiště**: pomocné funkce `arc(cx,cy,r,úhel0,úhel1,n)` pro oblouky, `ribbon(fn,n,poloviční šířka)` pro zakřivené dráhy a `oval(cx,cy,rx,ry,natočení)` pro šikmá jezírka.
- `logo: [x,y,šířka]` umístí logo na trávník, `logo: false` ho vypne.

Po změně PARu nezapomeň upravit tabulku PARů i na serveru.
