# ZAMIN FK Management — Prototype Test Plan

## Club setup prototype 0.1

Test on a narrow mobile viewport first.

### Club identity
- [ ] Form loads without requiring a login.
- [ ] Empty club name cannot be submitted.
- [ ] Club name is limited to 28 characters.
- [ ] Short name is generated from club name.
- [ ] Short name can be manually edited.
- [ ] Short name is limited to five uppercase letters/numbers.
- [ ] Primary colour can be changed.
- [ ] Secondary colour can be changed.
- [ ] Selected colours are reflected in the profile.

### Crest upload
- [ ] PNG upload works.
- [ ] JPG upload works.
- [ ] WEBP upload works.
- [ ] Unsupported file type is rejected.
- [ ] Files above 2 MB are rejected.
- [ ] Uploaded image preview appears.
- [ ] Default crest works when no image is uploaded.
- [ ] Crest remains after refreshing the same browser, if local storage permits.

### Dashboard and local data
- [ ] Dashboard displays club name and short name.
- [ ] Dashboard displays uploaded or default crest.
- [ ] Edit identity returns to the form with saved values.
- [ ] Reset clears only this prototype's local demo key.
- [ ] No request is sent to the live ZAMIN FK backend.
- [ ] No Telegram authentication or bot route is invoked.
- [ ] No production database is accessed.

### Responsive and accessibility
- [ ] Layout fits a 360px-wide screen without horizontal scrolling.
- [ ] Buttons and upload label are comfortably tappable.
- [ ] Form labels are visible and associated with inputs.
- [ ] Text remains readable at normal mobile zoom.
- [ ] Browser console has no uncaught errors.

## Known limitations

This is a first visual/interaction slice, not a complete club game. It has no multi-user persistence, server-side validation, player database, transfers, missions, league or match engine.

Record actual test results before moving to the next stage. Do not mark unchecked items as passed without testing.
