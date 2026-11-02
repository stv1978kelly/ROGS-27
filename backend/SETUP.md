# ROGS 2027 backend setup

The score card page saves cards to a Google Sheet through a small Apps Script
(`Code.gs`). The script also works out the Stableford points and sends each
day's leaderboard back to the page.

## One-time setup (about 2 minutes)

1. Go to <https://sheets.new> and name the new sheet **ROGS 2027 Scores**.
2. In the sheet: **Extensions > Apps Script**. Delete everything in the
   editor, paste in all of `Code.gs`, and click **Save**.
3. Click **Deploy > New deployment**, click the cog and pick **Web app**, then set:
   - Execute as: **Me**
   - Who has access: **Anyone**

   Click **Deploy**. Google asks you to authorise it, because it's your own
   script. If you see "Google hasn't verified this app", click **Advanced >
   Go to (project name)** and allow it.
4. Copy the **Web app URL**. It ends in `/exec`.
5. Open that URL with `?action=leaderboard` on the end in your browser. You
   should see `{"ok":true,"days":[...]}`, and the sheet should now have
   four tabs: Players, Settings, Schedule and Cards.
6. Paste the URL into `WEBAPP_URL` in `index.html`.

## Card PIN

The score card is behind a 4-digit PIN (tap the ROGS 2027 title). The sheet's
script checks it on every card, so it must be set in the script, not just the
page: in Apps Script open **Project Settings** (cog) > **Script Properties** >
**Add script property**, name it `CARD_PIN`, and give it the PIN as its value.
Never put the PIN in this repo; it's public. The page only holds a salted
SHA-256 of it (`PIN_HASH` in `index.html`, salt `rogs27:`), so changing the PIN
means updating both the Script Property and that hash.

## Running the trip

| Tab | What to do |
|---|---|
| **Schedule** | Pick each day's course from the dropdown. Fill in **Date** only if the same course is played on two days. |
| **Players** | Each player's **certified starting handicap** for the tour. Don't change it during the trip: after every played day the script adjusts it automatically (League 1 = 10 or below: 0.3 per point; League 2 = 11-18: 0.5; League 3 = 19 and up: 0.7; cut per point over 34, added per point under 28; the day's winner gets 1 shot off and last place 1 shot on; 4 shots max either way per day; no card = no change). Course handicaps per course come from each course's rating and slope. |
| **Settings** | Allowance: `1` (or `100`) for full handicap, `0.95` (or `95`) for 95%. |
| **Notifications** | Type a message in the **Message** column; **Posted** fills in the time by itself. It shows on everyone's bell, and as a banner for 24 hours. Delete the row to remove it. |
| **Cards** | Filled automatically. If a player resubmits a card for the same course, the newest one counts. |

Points are always recalculated from the raw scores, so changing a handicap,
the allowance or the schedule updates every leaderboard straight away. No
redeploy is needed.

## Changing the script later

After pasting a new `Code.gs`: **Deploy > Manage deployments > pencil >
Version: New version > Deploy**. The URL stays the same.

## Testing locally (no Google needed)

```
node backend/test/test.js     # runs the real Code.gs against a fake sheet
node backend/test/server.js   # full working page at http://127.0.0.1:8812
```

The par and stroke index in `Code.gs` must match `COURSES` in `index.html`.
`test.js` checks this, so run it after editing any course data.
