<img width="1896" height="1032" alt="Screenshot 2026-08-24 175957" src="https://github.com/user-attachments/assets/281db631-4bc3-4c35-8459-2e5a811f8223" />

# PageLens — a read-only AI page explainer

PageLens is a Chrome extension that lets you ask an AI questions about the
page you're currently looking at, summarize it, explain it simply, or flag
things worth noticing (fees, fine print, deadlines, data collection, etc).

*It is strictly read-only.* PageLens only reads the visible text of the
current tab and sends it to Claude for analysis. It never clicks, types,
fills forms, or submits anything on your behalf, unlike most "AI browser
agent" extensions, there is no action/automation layer at all, which keeps
the trust and risk profile much simpler.

## How it works

1. Click the PageLens toolbar icon to open the side panel.
2. Add your own Anthropic API key in settings (stored locally via
   `chrome.storage`, sent directly from your browser to Anthropic's API —
   it never passes through any third-party server).
3. Ask a question, or use a quick action (Summarize / Explain simply / What
   should I watch for?).
4. PageLens reads the current tab's text and headings, sends it with your
   question to Claude, and shows the answer in the panel.

## Install (unpacked, for development)

1. Clone or download this repo.
2. Open `chrome://extensions` in Chrome.
3. Turn on **Developer mode** (top right).
4. Click **Load unpacked** and select this project's folder.
5. Pin the PageLens icon and click it to open the side panel.
6. Add your Anthropic API key in the ⚙ settings panel.

## Project structure

\`\`\`
manifest.json      # MV3 manifest — activeTab, scripting, sidePanel, storage only
background.js       # Opens the side panel on toolbar click
sidepanel.html/css  # Side panel UI
sidepanel.js        # Page reading + Anthropic API calls + chat rendering
icons/              # Toolbar icons
\`\`\`

## Permissions, and why each is needed

| Permission | Why |
|---|---|
| `activeTab` | Read the current tab only when you actively use the extension |
| `scripting` | Inject a read-only text-extraction function into the page |
| `sidePanel` | Show the chat UI in Chrome's side panel |
| `storage` | Save your API key/model choice locally |
| `host_permissions: <all_urls>` | Allow reading any page you choose to ask about |

No `cookies`, no `webRequest`, no ability to modify page content or
navigate — the extension physically cannot take actions on a page, only
read it.

## Ideas for extending this

- Highlight-to-ask: right-click a text selection and ask about just that.
- Per-page memory: cache summaries so re-visiting a page is instant.
- Export chat as notes / send to a notes app.
- Support Firefox/Edge via the WebExtensions API (mostly a manifest tweak).
- Streaming responses instead of waiting for the full answer.

## License

MIT — do whatever you like with it.
