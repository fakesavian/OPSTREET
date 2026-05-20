import requests
import re
import json
import datetime
import math
from pathlib import Path
from urllib.parse import quote

CT = "https://www.capitoltrades.com"
UA = {"User-Agent": "Mozilla/5.0", "RSC": "1"}
import os

ALP_KEY = os.environ.get("ALPACA_API_KEY", "")
ALP_SEC = os.environ.get("ALPACA_SECRET_KEY", "")
AH = {"APCA-API-KEY-ID": ALP_KEY, "APCA-API-SECRET-KEY": ALP_SEC}


def rsc(path: str) -> str:
    url = CT + path + (("&" if "?" in path else "?") + "_rsc=x")
    return requests.get(url, headers=UA, timeout=30).text


def extract_balanced(s: str, start: int):
    pairs = {"[": "]", "{": "}"}
    opench = s[start]
    closech = pairs[opench]
    depth = 0
    in_str = False
    esc = False
    for i in range(start, len(s)):
        c = s[i]
        if in_str:
            if esc:
                esc = False
            elif c == "\\":
                esc = True
            elif c == '"':
                in_str = False
        else:
            if c == '"':
                in_str = True
            elif c == opench:
                depth += 1
            elif c == closech:
                depth -= 1
                if depth == 0:
                    return s[start : i + 1], i + 1
    raise ValueError("unbalanced")


def extract_trades(txt: str):
    arrays = []
    pos = 0
    while True:
        idx = txt.find('"data":[{"_issuerId"', pos)
        if idx < 0:
            break
        st = txt.find("[", idx)
        arrtxt, end = extract_balanced(txt, st)
        try:
            arr = json.loads(arrtxt)
            if arr and "_txId" in arr[0]:
                arrays.append(arr)
        except Exception:
            pass
        pos = end
    return max(arrays, key=len) if arrays else []


def extract_name(txt: str):
    chunk = txt[txt.find("q-trade-explorer") : txt.find("q-trade-explorer") + 5000]
    m = re.search(r'"children":"([A-Z][^"\\]{2,60})"', chunk)
    return m.group(1) if m else "Unknown"


def extract_ids():
    ids = []
    for page in range(1, 8):
        txt = rsc(f"/politicians?page={page}")
        for m in re.finditer(r'href":"/politicians/([A-Z]\d{6})".*?"children":"([^"\\]+)"', txt):
            pid, name = m.groups()
            if pid not in [x[0] for x in ids]:
                ids.append((pid, name))
    for pid in ["C001123", "M001236", "S001217", "M001204", "C001103", "S001203", "S001211", "M001234", "S000168", "R000614", "W000829", "M001157", "D000617", "K000389"]:
        if pid not in [x[0] for x in ids]:
            ids.append((pid, ""))
    return ids[:50]


def fetch_trades(pid: str, max_pages: int = 4):
    all_trades = []
    seen = set()
    name = None
    for p in range(1, max_pages + 1):
        txt = rsc(f"/politicians/{pid}?page={p}&pageSize=100")
        if not name:
            name = extract_name(txt)
        arr = extract_trades(txt)
        new = 0
        for t in arr:
            if t.get("_txId") not in seen:
                seen.add(t.get("_txId"))
                all_trades.append(t)
                new += 1
        if new == 0 or len(arr) < 100:
            break
    return name or pid, all_trades


price_cache = {}


def bars(sym: str, start: str = "2022-01-01"):
    sym = sym.split(":")[0].replace(".", "-")
    if sym in price_cache:
        return price_cache[sym]
    url = f"https://data.alpaca.markets/v2/stocks/{quote(sym)}/bars"
    params = {"timeframe": "1Day", "start": start + "T00:00:00Z", "adjustment": "all", "feed": "iex", "limit": 10000}
    r = requests.get(url, headers=AH, params=params, timeout=20)
    if r.status_code != 200:
        params.pop("feed", None)
        r = requests.get(url, headers=AH, params=params, timeout=20)
    try:
        js = r.json()
    except Exception:
        js = {}
    raw_bars = js.get("bars") or []
    d = {b["t"][:10]: b["c"] for b in raw_bars if b.get("t") and b.get("c") is not None}
    price_cache[sym] = d
    return d


def nearest_on_or_after(series, date):
    if not series:
        return None, None
    keys = sorted(series)
    import bisect

    i = bisect.bisect_left(keys, date)
    if i >= len(keys):
        return None, None
    return keys[i], series[keys[i]]


def nearest_on_or_before(series, date):
    if not series:
        return None, None
    keys = sorted(series)
    import bisect

    i = bisect.bisect_right(keys, date) - 1
    if i < 0:
        return None, None
    return keys[i], series[keys[i]]


def add_days(d: str, n: int):
    return (datetime.date.fromisoformat(d) + datetime.timedelta(days=n)).isoformat()


def evaluate(trades, limit=300):
    rows = []
    today = datetime.date.today().isoformat()
    spy = bars("SPY", "2022-01-01")
    for t in sorted(trades, key=lambda x: x.get("txDate", ""))[-limit:]:
        tick = (t.get("issuer") or {}).get("issuerTicker")
        if not tick or not tick.endswith(":US"):
            continue
        sym = tick.split(":")[0].replace(".", "-")
        tx_type = t.get("txType")
        if tx_type not in ("buy", "sell"):
            continue
        try:
            val = float(t.get("value") or 0)
        except Exception:
            val = 0
        if val <= 0:
            continue
        ser = bars(sym, "2022-01-01")
        cur_d, cur_p = nearest_on_or_before(ser, today)
        pol_d, pol_p = nearest_on_or_after(ser, t["txDate"])
        pub = t.get("pubDate", "")[:10]
        copy_target = add_days(pub, 45) if pub else add_days(t["txDate"], 45)
        copy_d, copy_p = nearest_on_or_after(ser, copy_target)
        if not (cur_p and pol_p and copy_p):
            continue
        sign = 1 if tx_type == "buy" else -1
        pol_ret = sign * (cur_p / pol_p - 1)
        copy_ret = sign * (cur_p / copy_p - 1)
        rows.append(
            {
                "txId": t["_txId"],
                "symbol": sym,
                "issuer": (t.get("issuer") or {}).get("issuerName", sym),
                "type": tx_type,
                "txDate": t["txDate"],
                "pubDate": pub,
                "copyDate": copy_d,
                "politicianEntryDate": pol_d,
                "value": val,
                "politicianEntry": round(pol_p, 4),
                "copyEntry": round(copy_p, 4),
                "currentPrice": round(cur_p, 4),
                "currentDate": cur_d,
                "politicianReturn": pol_ret,
                "copyReturn": copy_ret,
                "politicianPnl": val * pol_ret,
                "copyPnl": val * copy_ret,
                "reportingGap": t.get("reportingGap"),
            }
        )
    return rows


def main():
    ids = extract_ids()
    print("candidate ids", len(ids))
    score = []
    data_by = {}
    for pid, _name_hint in ids[:14]:
        try:
            name, tr = fetch_trades(pid, 2)
            rows = evaluate(tr, 160)
            if len(rows) >= 15:
                copy = sum(r["copyPnl"] for r in rows)
                pol = sum(r["politicianPnl"] for r in rows)
                capital = sum(r["value"] for r in rows)
                score.append((copy / capital if capital else -9, copy, pol, capital, pid, name, len(rows)))
                data_by[pid] = (name, tr, rows)
                print(pid, name, len(rows), "copy", round(copy), "pol", round(pol), "ret", round(copy / capital * 100, 2))
        except Exception as e:
            print("ERR", pid, e)
    score.sort(reverse=True)
    print("TOP", score[:5])
    best = score[0]
    pid = best[4]
    name, _tr, rows = data_by[pid]
    start = min(min(r["politicianEntryDate"], r["copyDate"]) for r in rows)
    end = max(r["currentDate"] for r in rows)
    spy = bars("SPY", "2022-01-01")
    dates = [d for d in sorted(spy) if start <= d <= end]

    def curve(kind):
        out = []
        for d in dates:
            pnl = 0
            cap = 0
            active = 0
            for r in rows:
                entry_date = r["politicianEntryDate"] if kind == "politician" else r["copyDate"]
                entry_price = r["politicianEntry"] if kind == "politician" else r["copyEntry"]
                if d < entry_date:
                    continue
                ser = price_cache[r["symbol"]]
                _pd, p = nearest_on_or_before(ser, d)
                if not p:
                    continue
                sign = 1 if r["type"] == "buy" else -1
                pnl += r["value"] * sign * (p / entry_price - 1)
                cap += r["value"]
                active += 1
            out.append({"date": d, "pnl": round(pnl, 2), "returnPct": round(100 * pnl / cap, 2) if cap else 0, "capital": round(cap, 2), "activeTrades": active})
        return out

    def spy_curve(basis):
        out = []
        for d in dates:
            pnl = 0
            cap = 0
            for r in rows:
                entry_date = r["politicianEntryDate"] if basis == "politician" else r["copyDate"]
                if d < entry_date:
                    continue
                _ed, ep = nearest_on_or_after(spy, entry_date)
                _pd, p = nearest_on_or_before(spy, d)
                if ep and p:
                    pnl += r["value"] * (p / ep - 1)
                    cap += r["value"]
            out.append({"date": d, "pnl": round(pnl, 2), "returnPct": round(100 * pnl / cap, 2) if cap else 0, "capital": round(cap, 2)})
        return out

    total_cap = sum(r["value"] for r in rows)
    summary = {
        "selected": {"id": pid, "name": name, "reason": "Highest 45-day-delayed copy-trade return among the first 14 modelable CapitolTrades politicians tested from current politician pages."},
        "method": {
            "delayDays": 45,
            "source": "CapitolTrades RSC politician pages + Alpaca stock bars API (paper account keys used transiently during generation).",
            "tradeLimit": "Up to 250 latest modelable stock BUY/SELL trades per candidate; selected dashboard contains modelable trades fetched within page limit.",
            "sellHandling": "SELL disclosures are modeled as inverse/avoidance signals for comparison; BUY as long signals. Each disclosure uses its CapitolTrades disclosed value as trade notional.",
        },
        "asOf": datetime.datetime.utcnow().replace(microsecond=0).isoformat() + "Z",
        "candidateScores": [
            {"id": x[4], "name": x[5], "modelableTrades": x[6], "copyPnl": round(x[1], 2), "politicianPnl": round(x[2], 2), "capital": round(x[3], 2), "copyReturnPct": round(100 * x[0], 2)}
            for x in score[:12]
        ],
        "totals": {
            "modelableTrades": len(rows),
            "capital": round(total_cap, 2),
            "copyPnl": round(sum(r["copyPnl"] for r in rows), 2),
            "politicianPnl": round(sum(r["politicianPnl"] for r in rows), 2),
            "copyReturnPct": round(100 * sum(r["copyPnl"] for r in rows) / total_cap, 2),
            "politicianReturnPct": round(100 * sum(r["politicianPnl"] for r in rows) / total_cap, 2),
        },
        "curves": {"copyDelayed": curve("copy"), "politicianActual": curve("politician"), "sp500CopyBasis": spy_curve("copy")},
        "trades": sorted(
            [
                {
                    **r,
                    "politicianReturn": round(r["politicianReturn"] * 100, 2),
                    "copyReturn": round(r["copyReturn"] * 100, 2),
                    "politicianPnl": round(r["politicianPnl"], 2),
                    "copyPnl": round(r["copyPnl"], 2),
                }
                for r in rows
            ],
            key=lambda r: r["copyPnl"],
            reverse=True,
        ),
    }
    out = Path("apps/web/public/data/congress-copytrade-model.json")
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(summary, separators=(",", ":")), encoding="utf-8")
    print("WROTE", pid, name, len(rows), "file bytes", out.stat().st_size)


if __name__ == "__main__":
    main()
