# Shared Help API — API 1

Generics owns the Help window, navigation tree, bottom menu, divider and contextual setting links. Each consumer owns **all** its help content, including its author, thanks and Premium pages. Generics' own help describes only Generics settings.

## Consumer contract

```js
const HelpApplication = generics.help.createHelpApplication({
  id: "my-module-help",
  title: () => localize("Help.Title"),
  classes: ["my-module-window"],
  initialPageId: "start",
  getContent: () => ({
    pages: [
      { id: "start", title: "Prepare for play", html: '<section id="participants">...</section>' },
      { id: "author", title: "Author", html: "..." },
      { id: "thanks", title: "Thanks", html: "..." },
      { id: "modules", title: "dmicher modules", html: "..." }
    ],
    tree: [{
      id: "prepare", title: "Preparation",
      children: [{ id: "start", pageId: "start", title: "Prepare for play" }]
    }],
    footer: ["author", "thanks", "modules"],
    labels: { contents: "Help contents", resizeNavigation: "Resize navigation" }
  })
});
const help = new HelpApplication();
await help.navigate("start", "participants");
```

The factory accesses Foundry's ApplicationV2 only when called; importing `api.js` alone does not require Foundry. Each instance owns its current page, expanded groups and navigation width. The divider supports pointer dragging and arrow keys; Home/End select its bounds. Width is clamped again when the window is resized. Listeners and the ResizeObserver are released on close and before rebinding.

`getContent` may return a value or Promise. Supply fully localized titles and content for the current language. Page and tree-node IDs must be unique within their own lists and contain only letters, digits, dots, hyphens and underscores. Three consumer-supplied footer pages are required, in the order shown; they cannot be placed inside the main tree. Any tree node may have children and an optional `pageId`.

`navigate(pageId, anchor?)` returns `Promise<boolean>`: false means an unknown page, and no rendering occurs. Otherwise it renders the window, opens ancestor groups, brings it to the front and scrolls to the element with that exact ID. Omitting the anchor opens the top of the page. Keep stable page/section IDs across translations.

Page HTML is trusted static content from the owning module, not arbitrary world/player HTML. Escape any variable text before inserting it. Internal links use `data-help-page="page-id"` and optionally `data-help-anchor="section-id"`; anchors without `href` are made keyboard-accessible by the shell. External links and images remain part of the consumer's content. Do not embed executable handlers in Help.

## Contextual setting help

```js
const disposeHelp = generics.help.bindSettingHelp(form, {
  open: (pageId, anchor) => help.navigate(pageId, anchor),
  tabIndex: -1, // Optional: omit the question icon from sequential form navigation.
  entries: [{
    selector: '[name="participants"]',
    pageId: "start", anchor: "participants",
    hint: "Choose who takes part in this activity.",
    label: "Help: participants"
  }]
});
```

The helper appends a question icon beside the setting caption. It preserves field values and does not change the consumer's permissions. The native tooltip uses `hint`; click opens the supplied page and section. `label` optionally gives a localized accessible name. Links remain usable inside disabled fieldsets so locked options can explain themselves. Repeated binding skips an already present target in the same label. Call the returned, idempotent disposer before rerendering or closing an owning application.

`tabIndex` defaults to `0`. A consumer may explicitly pass `-1` to keep mouse help while skipping the icons during Tab navigation; Master screen uses this option. Other consumers retain their keyboard behavior.

For a button setting, the helper creates a small overlay at its top-left corner instead of adding a sibling to the button row. A positioning wrapper preserves the button's flex size. The question itself is a sibling of the control, not a nested interactive button; its click and pointer press never reach the underlying control. Toggle-like checkbox labels may opt in with `data-dmicher-help-overlay` or `role="button"`. Text labels retain an inline question. Question icons have no underline, including hover and inherited text styles. Disposal restores the original control location.

The final footer page is `modules` and describes the suite in the consumer's own content. Consumers declare this ID explicitly; missing pages are not renamed or redirected. No suite page content is injected by Generics.

Help must be available in Russian and English, updated alongside functionality, brief and written around useful table actions. Explain important settings individually in a separate section: visible name, meaning and expected behavior. Help pages contain operating instructions; implementation and architecture belong in repository documentation such as this file.
