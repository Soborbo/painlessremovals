# Hibajelentés — az i-mve CRM nem kapja meg a leadeket (timeout)

**Dátum:** 2026-06-11
**Érintett rendszer:** painlessremovals.com (Cloudflare Worker: `painlessremovals-website`)
**Cél-rendszer:** i-mve CRM — `https://api.app.i-mve.com/job/user/67afa16a88df164ff28c0780`
**Státusz:** a lead a Painless-CRM-be megérkezik, az i-mve-be **nem**.

---

## 1. Tünet

A weboldal űrlapjai és a kalkulátor két helyre küldenek leadet:
- **Painless-CRM** (új, aláírt webhook) → **megérkezik** (HTTP 200).
- **i-mve CRM** (meglévő integráció) → **NEM érkezik meg**.

A Cloudflare Worker logjában az i-mve hívás **10 másodperc után timeoutol**:

```
[ERROR][i-mve] API call timed out {"timeoutMs":10000}
[ERROR][i-mve] Sync failed {"quoteId":"CB-MQ9YYIS4","error":"Timeout after 10000ms"}
```

Korábban (hónapokig, egészen a legutóbbi deployig / ma délutánig) az i-mve **tökéletesen működött**.

---

## 2. Mérési eredmények (bizonyíték)

### 2.1. Az i-mve végpont működik és GYORSAN válaszol — de allowlist van rajta
Külső gépről (nem Cloudflare) a végpontot lekérdezve:

```
GET/POST https://api.app.i-mve.com/job/user/67afa16a88df164ff28c0780
→ HTTP 403  (válaszidő: ~0.10–0.24 s)
→ body:    "Host not in allowlist"
→ header:  x-deny-reason: host_not_allowed
```

Ugyanez `Origin: https://painlessremovals.com` headerrel is **403**.
Tehát a végpont **nem lassú és nem áll**, hanem **forrás-allowlist (engedélyezőlista)** utasítja el a nem engedélyezett forrásokat — **gyors 403**-mal.

### 2.2. A végpont NEM a Cloudflare mögött van
```
api.app.i-mve.com → 80.94.43.66   (saját origin/tűzfal, nem Cloudflare)
```

### 2.3. A Worker viszont TIMEOUTOL (nem 403-at kap)
A Cloudflare Worker kérése nem gyors 403-at kap, hanem **10 másodpercig lóg, majd timeoutol**.
Ez azt jelenti, hogy az i-mve tűzfala a **nem engedélyezett Cloudflare-forrást csendben eldobja (DROP)**, nem pedig elutasítja (REJECT/403).

| Forrás | Eredmény | Válaszidő |
|---|---|---|
| Külső IP (nem allowlistelt) | HTTP 403 „Host not in allowlist" | ~0.1 s |
| Cloudflare Worker | **Timeout** (nincs válasz) | 10 s (DROP) |

---

## 3. Mit zártunk ki — NEM a kódváltozás okozza

A legutóbbi frissítés (Painless-CRM integráció) **átnézett diffje** alapján:

- Az **i-mve hívás kódja változatlan**: a payload, a HTTP-headerek, a 10 s-os timeout és az engedélyező feltétel (`IMVE_API_URL` megléte) **bájtra azonos** a frissítés előttivel. A frissítés csak **egy új CRM-blokkot adott hozzá az i-mve sync UTÁN**.
- A **Worker futtatókörnyezete változatlan**: `compatibility_date`, `nodejs_compat`, a middleware és az `astro.config` **nem módosult**.
- A kérésben az **i-mve sync az új kód ELŐTT fut le** → ami utána jön, az fizikailag nem ronthatja el a már lefutott i-mve fetch-et.

➡️ A Worker tehát **ugyanazt a kérést küldi az i-mve-nek, mint hónapokig**.

---

## 4. Valószínű gyökérok

**Cloudflare Workers + i-mve IP-allowlist ütközése, amit egy deploy hozott felszínre.**

- A Cloudflare Workereknek **nincs fix kimenő (egress) IP-jük** — a Cloudflare globális hálózatáról, **váltakozó IP-kről** mennek ki a kérések.
- Az i-mve egy **fix forrás-IP allowlistet** használ (lásd 2.1).
- Hónapokig a Worker olyan Cloudflare egress-IP-ről ment ki, ami **benne volt** az i-mve allowlistjében → működött.
- A **legutóbbi deploy (ma délután)** után a Worker **másik egress-IP-re válthatott**, ami **már nincs** az i-mve allowlistjében → az i-mve tűzfala **eldobja (DROP)** → **10 s timeout**.

Ez magyarázza egyszerre, hogy:
- „hónapokig / ma délutánig működött" (allowlistelt IP),
- „a frissítés után elromlott" (deploy → új egress-IP → allowlist-eltérés),
- a kód viszont **ugyanaz** (a deploy mellékhatása az IP-váltás, nem a kódlogika).

---

## 5. A perdöntő ellenőrzés (i-mve oldalán, ~1 perc)

Az i-mve **tűzfal- / hozzáférési logjában** meg kell nézni a painlessremovals kéréseit:

1. **Melyik forrás-IP-ről** érkeznek most a kérések?
2. Ez az IP **eltér-e a korábban engedélyezett (allowlistelt) IP-től?**
3. A logban szerepel-e a `host_not_allowed` elutasítás erre az IP-re?

Ha az új IP nincs az allowlistben → ez a bizonyíték, és egyben a megoldás kiindulópontja.

---

## 6. Megoldási lehetőségek

| Megoldás | Tartósság | Teendő |
|---|---|---|
| **A) Token-auth (ajánlott)** | Tartós, deploy-független | Az i-mve adjon API-kulcsot/tokent (HTTP headerben), az IP-allowlist helyett. Beállítjuk `IMVE_API_KEY`-nek, a kód már küldi `Authorization: Bearer`-ként. |
| **B) Fix-IP-s egress / proxy** | Tartós | Az i-mve hívás egy fix IP-s szolgáltatáson keresztül megy (amit az i-mve allowlistel), pl. Cloudflare-megoldás vagy saját proxy. |
| **C) Új egress-IP allowlistelése** | **Törékeny** | Az i-mve vegye fel a Worker mostani egress-IP-jét. Hátrány: a következő deploynál újra elcsúszhat. |

**Javaslat:** A) token-auth — ez szünteti meg végleg a problémát, mert nem függ a változó egress-IP-től.

---

## 7. Kapcsolódó, már javított ügy (külön a fentitől)

A frissítés után rövid ideig a `/api/save-quote` és `/api/callbacks` **500-as hibát** adott:
```
Astro.locals.runtime.ctx has been removed in Astro v6. Use 'Astro.locals.cfContext' instead.
```
Ez **javítva** (PR #12, `locals.cfContext`-re átállítva) és a `main`-en van. Ellenőrizendő, hogy a production a javított buildet futtatja-e.

---

## For i-mve support (English summary)

Requests from our site no longer reach your API endpoint
`https://api.app.i-mve.com/job/user/67afa16a88df164ff28c0780`.

- Your endpoint returns a fast **HTTP 403 "Host not in allowlist"**
  (`x-deny-reason: host_not_allowed`) to non-allowlisted sources.
- Our requests now come from **Cloudflare Workers**, which **do not have a
  fixed egress IP** — and the egress IP likely changed on our last deploy.
- From the Worker the request **times out (no response / dropped)** instead of
  getting the 403, suggesting your firewall **DROPs** non-allowlisted
  Cloudflare egress IPs.

**Please check your firewall/access log:** which source IP do you currently see
for our requests, and is it being rejected by the host allowlist?

**Preferred fix:** please provide **token/API-key authentication** (HTTP header)
instead of (or in addition to) the IP allowlist, since Cloudflare Workers cannot
guarantee a stable source IP. Alternatively, allowlist our current egress IP
(note: this may need re-updating after future deploys).
