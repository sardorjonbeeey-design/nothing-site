# Club Setup Prototype — 0.1

This is a standalone, browser-only prototype for the ZAMIN FK management game.

## Run it

Open `index.html` in a modern browser. No package installation, backend, Telegram login, database, or build process is required.

For phone testing, the files can be opened through a static preview or a temporary isolated preview host. Do not publish this as the live ZAMIN FK Mini App.

## What works

- Enter a club name and short name.
- Select primary and secondary colours.
- Upload a PNG, JPG or WEBP crest (maximum 2 MB).
- Preview the crest.
- Create a local demo club.
- Reopen the identity form and edit it.
- Reset the local demo.

## Data handling

The demo stores the club profile in this browser's `localStorage`. Uploaded crest data is stored as a browser data URL in that local profile.

This is temporary prototype storage only:
- It is not shared with other users.
- It is not backed up.
- It is not connected to any ZAMIN FK account.
- Clearing browser data may remove it.
- It must not be used for production user data.

## Deliberately not included

- Telegram authentication or bot integration.
- Backend or database connection.
- Real club budget or transfer transactions.
- Existing supporter portal, Fan XP, Influence or personal coins.
- Real player records or community member records.
- Squad management, match simulation or league.
- External AI logo generation or payment.

## Next prototype stage

After the club identity flow is reviewed, create the virtual player and squad experience as a separate isolated addition. Do not connect it to existing systems.
