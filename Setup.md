# StickyBoard Setup Guide

StickyBoard is a free, self-hosted collaborative sticky-note canvas for classrooms, workshops, staff PD, brainstorming, exit tickets, and group reflection. It uses static HTML files plus Google Sheets and Google Apps Script as the backend.

StickyBoard fills a Jamboard-style need without requiring a paid FigJam, Lucidspark, Padlet, or similar account.

## Files Included

| File | Purpose |
|---|---|
| `index.html` | Public sticky-note canvas. Participants can view and move visible sticky notes. |
| `Submit.html` | Public form for adding sticky notes. |
| `Admin.html` | Password-protected facilitator console for moderation, editing, deletion, and settings. |
| `config.js` | One-line file that holds the Apps Script Web App URL. Shared by all three pages. |
| `code.gs` | Google Apps Script backend connected to a Google Sheet. |
| `Setup.md` | This setup guide. |

## What StickyBoard Does

- Lets students, attendees, or staff submit sticky notes.
- Supports note text up to 2000 characters with a safe subset of Markdown (bold, italic, strikethrough, headings, ordered/unordered lists, blockquotes, inline code, code blocks, and `https://` links).
- Lets anyone "heart" / like a sticky note anonymously (one like per browser).
- Lets each note include an optional image (PNG, JPG, WEBP, or SVG) stored in your Google Drive.
- Supports multiple sticky-note colors: yellow, blue, green, pink, purple, and orange.
- Allows optional names or team labels.
- Allows optional categories such as `Idea`, `Question`, `Wonder`, `Evidence`, or `Next Step`.
- Displays notes as a wall of compact sticky tiles. Clicking a note expands it into a modal that renders the full Markdown content and image.
- Allows visible notes to be dragged and repositioned.
- Publishes an Atom/RSS feed of the latest approved notes so people can subscribe.
- Lets the admin set a board title (shown as `StickyBoard - <Title>`), description (replaces the default subtitle), and a contact email shown as a Contact link.
- Includes an admin console for approving, hiding, editing, or deleting notes, including replacing or removing attached images.
- Includes a moderation setting:
  - **Moderation ON:** new notes wait for approval.
  - **Moderation OFF:** new notes appear immediately.
- Includes a linked digital citizenship reminder on the board and submit pages.

## Step 1: Create the Google Sheet

1. Go to Google Drive.
2. Create a new Google Sheet.
3. Name it something like `StickyBoard Responses`.
4. Open the sheet.
5. Go to **Extensions > Apps Script**.

## Step 2: Add the Apps Script Backend

1. In Apps Script, delete any starter code.
2. Open `code.gs` from this package.
3. Copy the entire contents of `code.gs`.
4. Paste it into the Apps Script editor.
5. Save the project.
6. Name the Apps Script project `StickyBoard`.

The script will automatically create a sheet tab named `StickyBoard Notes` the first time it runs.

## Step 3: Set the Admin Passcode

1. In Apps Script, click **Project Settings**.
2. Scroll to **Script Properties**.
3. Add this property:

| Property | Value |
|---|---|
| `ADMIN_PASSCODE` | Your private admin password |

Example:

```text
ADMIN_PASSCODE = ChangeThisPasscode123
```

Optional setting:

| Property | Value |
|---|---|
| `MODERATION_ENABLED` | `true` or `false` |

If you do not add `MODERATION_ENABLED`, StickyBoard starts with moderation turned on.

You can also set the following optional properties, though they are normally managed from the **Admin** page:

| Property | Purpose |
|---|---|
| `BOARD_TITLE` | Title shown beside the StickyBoard logo, e.g. `Pez Center` becomes `StickyBoard - Pez Center`. |
| `BOARD_DESCRIPTION` | Replaces the default `Post ideas, sort patterns...` subtitle. Up to 400 characters. |
| `CONTACT_EMAIL` | Shown as a Contact button on the public pages. |
| `IMAGES_FOLDER_ID` | Drive folder ID where uploaded images are stored. If unset, StickyBoard creates a folder named `StickyBoard Images` in your Drive on the first upload and saves its ID here automatically. |

## Step 4: Deploy as a Web App

1. In Apps Script, click **Deploy > New deployment**.
2. Choose **Web app**.
3. Use these settings:

| Setting | Recommended Value |
|---|---|
| Description | `StickyBoard Web App` |
| Execute as | `Me` |
| Who has access | `Anyone` or `Anyone with the link` |

4. Click **Deploy**.
5. Approve the permissions.
6. Copy the Web App URL.

The URL will look similar to this:

```text
https://script.google.com/macros/s/AKfycb.../exec
```

## Step 5: Connect the HTML Files to Apps Script

Open `config.js`. You only edit this one file &mdash; `index.html`, `Submit.html`, and `Admin.html` all load it.

Find this line:

```javascript
const SCRIPT_URL = 'PASTE_YOUR_APPS_SCRIPT_WEB_APP_URL_HERE';
```

Replace the value with your Apps Script Web App URL.

Example:

```javascript
const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbYOUR_DEPLOYMENT_ID/exec';
```

Save `config.js`. The three HTML files do not need to change.

## Step 6: Publish or Share the HTML Files

You can host the three HTML files in any simple static hosting location, such as:

- GitHub Pages
- Google Drive web hosting alternatives
- Replit
- Netlify
- Your school or organization web server
- A local shared folder for testing

Keep these four files in the same folder:

```text
index.html
Submit.html
Admin.html
config.js
```

`config.js` must live alongside the HTML files. Each HTML page loads it with `<script src="config.js"></script>` so they all see the same `SCRIPT_URL`.

The links are already built in:

- `index.html` links to `Submit.html`, `Admin.html`, and the digital citizenship section.
- `Submit.html` links back to `index.html`, `Admin.html`, and the digital citizenship section.
- `Admin.html` links to `index.html` and `Submit.html`.

## Board Title, Description, and Contact Email

Open `Admin.html`, log in, and use the **Board Settings** panel to set:

- **Board Title** &mdash; appears beside the StickyBoard logo, e.g. setting `Pez Center` displays `StickyBoard - Pez Center` across the board, submit, and admin pages and in the RSS feed.
- **Board Description** &mdash; replaces the default `Post ideas, sort patterns, and move notes around a shared canvas for brainstorming, exit tickets, group work, and staff PD.` subtitle.
- **Contact Email** &mdash; surfaces a Contact button on the board and submit pages.
- **Moderation** &mdash; toggle whether new notes require approval.

Click **Save Settings** to apply. Settings persist in Apps Script Script Properties so they survive redeploys.

## Image Uploads

Each sticky note can include one image (PNG, JPG, WEBP, or SVG) up to about 3 MB. The image:

- Uploads from `Submit.html` (or via Admin's **Add / Replace image**).
- Is stored in your Google Drive folder `StickyBoard Images` (auto-created on first upload). The folder ID is saved in Script Properties as `IMAGES_FOLDER_ID`. You can change it to any folder you own.
- Is shared as `Anyone with the link can view` so the board can render it. If your domain blocks public sharing, the upload still saves but the image will not preview for unauthenticated viewers.
- Is referenced by a Drive thumbnail URL (`https://drive.google.com/thumbnail?id=...&sz=w1200`). SVGs are rendered as PNG thumbnails by Drive.
- Is moved to Drive Trash automatically when the note is deleted or the image is removed/replaced from Admin.

## Markdown Support

Note text uses a small, safe Markdown subset:

| Syntax | Result |
|---|---|
| `**bold**` | bold |
| `*italic*` or `_italic_` | italic |
| `~~strike~~` | strikethrough |
| `# Heading` / `## Heading` / `### Heading` | headings |
| `- item` | unordered list |
| `1. item` | ordered list |
| `> quote` | blockquote |
| `` `inline code` `` | inline code |
| ` ```block``` ` | code block |
| `[text](https://example.com)` | link (opens in new tab) |

Raw HTML, `javascript:` links, and embedded `<img>` are stripped. Only `http://` and `https://` links are rendered.

The full Markdown is rendered when a note is opened in the modal. The sticky tile on the canvas shows a plain-text excerpt so the wall keeps its compact "sticky-note wall" look.

## Likes

Anyone viewing the board can tap the heart on a sticky note (or in the expanded modal) to "like" it. Likes are anonymous:

- Each browser generates a random ID stored in `localStorage` under `stickyboard.clientId`. The ID is sent only to your Apps Script backend and is never tied to a Google account, email, or IP.
- The sheet stores each note's liker IDs as a JSON array in the `likers` column. The public board only sees the count and whether the current browser has already liked the note.
- Clearing browser storage (or switching browsers) gives the user a new ID, so they can re-like a note. This is acceptable for classroom/workshop use; if you need stronger accounting, host behind SSO.
- Only approved (visible) notes can be liked. The Admin page shows the count next to each note's metadata. The RSS feed also includes the count.

## RSS / Atom Feed

StickyBoard publishes an Atom feed at:

```text
<YOUR_APPS_SCRIPT_URL>?action=rss
```

Click the **RSS** button in the top navigation on any page to copy or open the URL. Subscribers see the 50 most-recent approved notes with image and rendered content. Subscribers can paste this URL into any RSS reader (Feedly, NetNewsWire, Inoreader, Thunderbird, etc.).

## Recommended Classroom or Workshop Flow

### Moderated Mode

Use this when students are posting publicly during class.

1. Facilitator opens `Admin.html`.
2. Turn moderation on.
3. Participants open `Submit.html`.
4. Participants submit sticky notes.
5. Facilitator approves appropriate notes.
6. Participants view the shared canvas at `index.html`.

### Open Mode

Use this for trusted staff PD, small groups, or rapid brainstorming.

1. Facilitator opens `Admin.html`.
2. Turn moderation off.
3. Participants open `Submit.html`.
4. Notes appear immediately on `index.html`.
5. Facilitator can still hide, edit, or delete notes later.

## Suggested Uses

| Use Case | Suggested Categories |
|---|---|
| Brainstorming | Idea, Maybe, Build On This |
| Exit Ticket | Learned, Question, Still Confused |
| Staff PD | Strategy, Barrier, Resource, Next Step |
| Reading Response | Claim, Evidence, Question, Connection |
| Project Planning | Task, Risk, Resource, Owner |
| Gallery Walk | Notice, Wonder, Suggestion |

## Digital Citizenship Reminder

StickyBoard includes a built-in digital citizenship section. Before using it with students or workshop attendees, remind participants:

- Use the board for learning, planning, and reflection.
- Do not post names, private information, insults, or off-topic comments.
- Keep language school-appropriate and professional.
- Anonymous does not mean consequence-free.
- The facilitator may approve, edit, hide, or delete sticky notes.

## Troubleshooting

### The board says “Backend not configured”

The Apps Script URL has not been pasted into `config.js`, or `config.js` is missing from the folder.

Check:

- `config.js` exists in the same folder as `index.html`, `Submit.html`, and `Admin.html`.
- The `SCRIPT_URL` value in `config.js` is your Apps Script Web App URL (not the `PASTE_YOUR_...` placeholder).
- Your browser is not blocking `config.js` (open the page's developer console and look for a 404 on `config.js`).

### The admin page says the passcode is not set

Add `ADMIN_PASSCODE` in Apps Script Project Settings under Script Properties.

### Notes do not appear after submission

Check whether moderation is turned on.

- If moderation is on, notes must be approved in `Admin.html`.
- If moderation is off, notes should appear after the board refreshes.

### The board does not update immediately

`index.html` refreshes automatically every 20 seconds. You can also refresh the page manually.

### Participants cannot access the backend

Redeploy the Apps Script Web App and check the access setting. For most classroom use, set access to **Anyone with the link**.

### Image previews are broken or show a "no access" placeholder

This usually means your Google Workspace domain blocks `Anyone with the link` sharing. The image was uploaded, but Drive will not serve it to anonymous viewers. Options:

- Ask an admin to allow link-sharing for the Drive folder.
- Move the `StickyBoard Images` folder to a personal account and paste the new folder ID into the `IMAGES_FOLDER_ID` Script Property.
- Skip images for that board.

### Apps Script asks for new permissions after updating

Adding image uploads makes the script request Drive access. Re-approve the permissions the first time you deploy the new version. The script only creates and shares files in the `StickyBoard Images` folder (or the folder ID you provide).

### I changed the Apps Script but nothing changed

Apps Script deployments do not always update automatically.

1. Go to **Deploy > Manage deployments**.
2. Edit your deployment.
3. Choose a new version.
4. Deploy again.
5. Copy the latest Web App URL if it changed.

## Privacy Notes

StickyBoard is designed to avoid collecting student email addresses or login data. Notes are stored in your Google Sheet. Optional display names are participant-entered and should not be required for students unless your campus or district procedures allow it.

For student use, review your district policies before collecting any personal information.
