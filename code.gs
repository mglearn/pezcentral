/**
 * StickyBoard — Collaborative Sticky-Note Canvas
 * Google Apps Script Web App backend
 *
 * Static files expected:
 * - index.html  public sticky-note board
 * - Submit.html public sticky-note submission form
 * - Admin.html  passcode-protected moderation/settings console
 */

const PROJECT_NAME = 'StickyBoard';
const SHEET_NAME = 'StickyBoard Notes';
const IMAGES_FOLDER_NAME = 'StickyBoard Images';
const MAX_NOTE_CHARS = 2000;
const MAX_NAME_CHARS = 40;
const MAX_CATEGORY_CHARS = 40;
const MAX_TITLE_CHARS = 80;
const MAX_DESCRIPTION_CHARS = 400;
const MAX_EMAIL_CHARS = 120;
const MAX_IMAGE_BYTES = 2 * 1024 * 1024; // 2 MB decoded
const ALLOWED_STATUSES = ['pending', 'approved', 'hidden'];
const ALLOWED_COLORS = ['yellow', 'blue', 'green', 'pink', 'purple', 'orange'];
const ALLOWED_IMAGE_MIME = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/webp': 'webp',
  'image/svg+xml': 'svg'
};

const SHEET_HEADERS = [
  'id',
  'timestamp',
  'note',
  'displayName',
  'category',
  'color',
  'x',
  'y',
  'status',
  'adminNote',
  'imageFileId',
  'imageUrl',
  'likers',
  'lastUpdated'
];

const MAX_CLIENT_ID_CHARS = 64;

function doGet(e) {
  const p = (e && e.parameter) || {};
  const action = String(p.action || 'list');

  try {
    if (action === 'ping') {
      return jsonResponse({
        ok: true,
        project: PROJECT_NAME,
        sheet: SHEET_NAME,
        passcodeSet: Boolean(PropertiesService.getScriptProperties().getProperty('ADMIN_PASSCODE')),
        moderationEnabled: isModerationEnabled(),
        time: new Date().toISOString()
      });
    }

    if (action === 'settings') {
      return jsonResponse(Object.assign({ ok: true, colors: ALLOWED_COLORS }, publicSettings()));
    }

    if (action === 'list') {
      const clientId = cleanClientId(p.clientId);
      const notes = readSheet(getOrCreateSheet())
        .filter(function (n) { return n.id && n.status === 'approved'; })
        .map(function (n) { return publicNote(n, clientId); });
      return jsonResponse(Object.assign({ ok: true, notes: notes }, publicSettings()));
    }

    if (action === 'rss') {
      return rssFeed();
    }

    return jsonResponse({ ok: false, error: 'Unknown action.' });
  } catch (err) {
    return jsonResponse({ ok: false, error: errorMessage(err) });
  }
}

function doPost(e) {
  const p = (e && e.parameter) || {};
  const action = String(p.action || 'submit');

  try {
    if (action === 'submit') return submitNote(p);
    if (action === 'move') return moveNote(p);
    if (action === 'like') return likeNote(p);
    if (action === 'adminList') return adminList(p);
    if (action === 'approve') return adminSetStatus(p, 'approved');
    if (action === 'hide') return adminSetStatus(p, 'hidden');
    if (action === 'restore') return adminSetStatus(p, 'pending');
    if (action === 'delete') return adminDelete(p);
    if (action === 'update') return adminUpdate(p);
    if (action === 'settings') return adminUpdateSettings(p);

    return jsonResponse({ ok: false, error: 'Unknown action.' });
  } catch (err) {
    return jsonResponse({ ok: false, error: errorMessage(err) });
  }
}

function submitNote(p) {
  let note = cleanMarkdown(p.note || '');
  let displayName = cleanText(p.displayName || '');
  let category = cleanText(p.category || 'General');
  let color = cleanText(p.color || randomColor());
  let x = clampNumber(p.x, 4, 76, randomInt(8, 70));
  let y = clampNumber(p.y, 6, 74, randomInt(10, 64));

  if (!note) return jsonResponse({ ok: false, error: 'Sticky note text is required.' });
  if (note.length > MAX_NOTE_CHARS) note = note.slice(0, MAX_NOTE_CHARS);
  if (displayName.length > MAX_NAME_CHARS) displayName = displayName.slice(0, MAX_NAME_CHARS);
  if (category.length > MAX_CATEGORY_CHARS) category = category.slice(0, MAX_CATEGORY_CHARS);
  if (!category) category = 'General';
  if (ALLOWED_COLORS.indexOf(color) === -1) color = randomColor();

  const image = saveUploadedImage(p);

  const moderationEnabled = isModerationEnabled();
  const now = new Date();
  const row = {
    id: Utilities.getUuid(),
    timestamp: now.toISOString(),
    note: note,
    displayName: displayName,
    category: category,
    color: color,
    x: x,
    y: y,
    status: moderationEnabled ? 'pending' : 'approved',
    adminNote: '',
    imageFileId: image ? image.fileId : '',
    imageUrl: image ? image.url : '',
    likers: '[]',
    lastUpdated: now.toISOString()
  };

  appendRow(getOrCreateSheet(), row);
  return jsonResponse({ ok: true, id: row.id, status: row.status, moderationEnabled: moderationEnabled });
}

function moveNote(p) {
  const id = String(p.id || '').trim();
  if (!id) return jsonResponse({ ok: false, error: 'Missing note id.' });

  const x = clampNumber(p.x, 0, 88, 10);
  const y = clampNumber(p.y, 0, 84, 10);
  const sheet = getOrCreateSheet();
  const found = findRowById(sheet, id);
  if (!found) return jsonResponse({ ok: false, error: 'Note not found.' });

  const status = String(getCell(sheet, found, 'status'));
  if (status !== 'approved') return jsonResponse({ ok: false, error: 'Only visible notes can be moved.' });

  setCell(sheet, found, 'x', x);
  setCell(sheet, found, 'y', y);
  setCell(sheet, found, 'lastUpdated', new Date().toISOString());
  return jsonResponse({ ok: true, id: id, x: x, y: y });
}

function adminList(p) {
  const authError = checkAdminAuth(p);
  if (authError) return jsonResponse({ ok: false, error: authError });
  const notes = readSheet(getOrCreateSheet())
    .filter(function (n) { return n.id; })
    .map(function (n) { return Object.assign({}, n, { likeCount: parseLikers(n.likers).length }); })
    .reverse();
  return jsonResponse(Object.assign({ ok: true, notes: notes }, publicSettings()));
}

function likeNote(p) {
  const id = String(p.id || '').trim();
  if (!id) return jsonResponse({ ok: false, error: 'Missing note id.' });
  const clientId = cleanClientId(p.clientId);
  if (!clientId) return jsonResponse({ ok: false, error: 'Missing client id.' });

  const sheet = getOrCreateSheet();
  const found = findRowById(sheet, id);
  if (!found) return jsonResponse({ ok: false, error: 'Note not found.' });

  const status = String(getCell(sheet, found, 'status'));
  if (status !== 'approved') return jsonResponse({ ok: false, error: 'Only visible notes can be liked.' });

  const likers = parseLikers(getCell(sheet, found, 'likers'));
  const idx = likers.indexOf(clientId);
  const wantLike = String(p.like || '').toLowerCase();
  let liked;
  if (wantLike === 'true' || (wantLike === '' && idx === -1)) {
    if (idx === -1) likers.push(clientId);
    liked = true;
  } else {
    if (idx !== -1) likers.splice(idx, 1);
    liked = false;
  }

  setCell(sheet, found, 'likers', JSON.stringify(likers));
  setCell(sheet, found, 'lastUpdated', new Date().toISOString());
  return jsonResponse({ ok: true, id: id, likeCount: likers.length, likedByMe: liked });
}

function parseLikers(value) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(String(value));
    if (Array.isArray(parsed)) return parsed.filter(function (v) { return typeof v === 'string' && v; });
  } catch (err) {
    // Fall through to legacy comma-separated handling.
  }
  return String(value).split(',').map(function (v) { return v.trim(); }).filter(Boolean);
}

function cleanClientId(value) {
  return String(value || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, MAX_CLIENT_ID_CHARS);
}

function adminSetStatus(p, status) {
  const authError = checkAdminAuth(p);
  if (authError) return jsonResponse({ ok: false, error: authError });
  if (ALLOWED_STATUSES.indexOf(status) === -1) return jsonResponse({ ok: false, error: 'Invalid status.' });

  const id = String(p.id || '').trim();
  if (!id) return jsonResponse({ ok: false, error: 'Missing note id.' });

  const sheet = getOrCreateSheet();
  const found = findRowById(sheet, id);
  if (!found) return jsonResponse({ ok: false, error: 'Note not found.' });

  setCell(sheet, found, 'status', status);
  setCell(sheet, found, 'lastUpdated', new Date().toISOString());
  return jsonResponse({ ok: true, id: id, status: status });
}

function adminUpdate(p) {
  const authError = checkAdminAuth(p);
  if (authError) return jsonResponse({ ok: false, error: authError });

  const id = String(p.id || '').trim();
  if (!id) return jsonResponse({ ok: false, error: 'Missing note id.' });

  let note = cleanMarkdown(p.note || '');
  let displayName = cleanText(p.displayName || '');
  let category = cleanText(p.category || 'General');
  let color = cleanText(p.color || 'yellow');
  let adminNote = cleanText(p.adminNote || '');

  if (!note) return jsonResponse({ ok: false, error: 'Sticky note text cannot be blank.' });
  if (note.length > MAX_NOTE_CHARS) note = note.slice(0, MAX_NOTE_CHARS);
  if (displayName.length > MAX_NAME_CHARS) displayName = displayName.slice(0, MAX_NAME_CHARS);
  if (category.length > MAX_CATEGORY_CHARS) category = category.slice(0, MAX_CATEGORY_CHARS);
  if (!category) category = 'General';
  if (ALLOWED_COLORS.indexOf(color) === -1) color = 'yellow';

  const sheet = getOrCreateSheet();
  const found = findRowById(sheet, id);
  if (!found) return jsonResponse({ ok: false, error: 'Note not found.' });

  setCell(sheet, found, 'note', note);
  setCell(sheet, found, 'displayName', displayName);
  setCell(sheet, found, 'category', category);
  setCell(sheet, found, 'color', color);
  setCell(sheet, found, 'adminNote', adminNote);

  if (String(p.removeImage || '') === 'true') {
    const existingId = String(getCell(sheet, found, 'imageFileId') || '').trim();
    if (existingId) tryTrashFile(existingId);
    setCell(sheet, found, 'imageFileId', '');
    setCell(sheet, found, 'imageUrl', '');
  } else {
    const image = saveUploadedImage(p);
    if (image) {
      const existingId = String(getCell(sheet, found, 'imageFileId') || '').trim();
      if (existingId) tryTrashFile(existingId);
      setCell(sheet, found, 'imageFileId', image.fileId);
      setCell(sheet, found, 'imageUrl', image.url);
    }
  }

  setCell(sheet, found, 'lastUpdated', new Date().toISOString());
  return jsonResponse({ ok: true, id: id });
}

function adminUpdateSettings(p) {
  const authError = checkAdminAuth(p);
  if (authError) return jsonResponse({ ok: false, error: authError });

  const props = PropertiesService.getScriptProperties();
  const moderationEnabled = String(p.moderationEnabled || 'true') === 'true';
  props.setProperty('MODERATION_ENABLED', moderationEnabled ? 'true' : 'false');

  if (p.boardTitle !== undefined) {
    props.setProperty('BOARD_TITLE', cleanText(p.boardTitle).slice(0, MAX_TITLE_CHARS));
  }
  if (p.boardDescription !== undefined) {
    props.setProperty('BOARD_DESCRIPTION', cleanText(p.boardDescription).slice(0, MAX_DESCRIPTION_CHARS));
  }
  if (p.contactEmail !== undefined) {
    const email = cleanText(p.contactEmail).slice(0, MAX_EMAIL_CHARS);
    if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return jsonResponse({ ok: false, error: 'Contact email is not a valid address.' });
    }
    props.setProperty('CONTACT_EMAIL', email);
  }

  return jsonResponse(Object.assign({ ok: true }, publicSettings()));
}

function adminDelete(p) {
  const authError = checkAdminAuth(p);
  if (authError) return jsonResponse({ ok: false, error: authError });

  const id = String(p.id || '').trim();
  if (!id) return jsonResponse({ ok: false, error: 'Missing note id.' });

  const sheet = getOrCreateSheet();
  const found = findRowById(sheet, id);
  if (!found) return jsonResponse({ ok: false, error: 'Note not found.' });

  const existingId = String(getCell(sheet, found, 'imageFileId') || '').trim();
  if (existingId) tryTrashFile(existingId);

  sheet.deleteRow(found.rowIndex);
  return jsonResponse({ ok: true, id: id });
}

function checkAdminAuth(p) {
  const saved = PropertiesService.getScriptProperties().getProperty('ADMIN_PASSCODE');
  if (!saved) return 'Admin passcode has not been set in Script Properties.';
  const provided = String(p.passcode || '').trim();
  if (provided !== saved) return 'Incorrect admin passcode.';
  return '';
}

function isModerationEnabled() {
  const value = PropertiesService.getScriptProperties().getProperty('MODERATION_ENABLED');
  return value !== 'false';
}

function publicSettings() {
  const props = PropertiesService.getScriptProperties();
  return {
    moderationEnabled: isModerationEnabled(),
    boardTitle: props.getProperty('BOARD_TITLE') || '',
    boardDescription: props.getProperty('BOARD_DESCRIPTION') || '',
    contactEmail: props.getProperty('CONTACT_EMAIL') || ''
  };
}

function saveUploadedImage(p) {
  const raw = String(p.imageData || '').trim();
  if (!raw) return null;

  let mime = String(p.imageMimeType || '').toLowerCase().trim();
  let b64 = raw;
  const match = raw.match(/^data:([^;]+);base64,(.*)$/);
  if (match) {
    if (!mime) mime = match[1].toLowerCase();
    b64 = match[2];
  }
  if (!mime || !ALLOWED_IMAGE_MIME.hasOwnProperty(mime)) {
    throw new Error('Image must be PNG, JPG, WEBP, or SVG.');
  }

  let bytes;
  try {
    bytes = Utilities.base64Decode(b64);
  } catch (err) {
    throw new Error('Could not read uploaded image.');
  }
  if (!bytes || !bytes.length) throw new Error('Image upload was empty.');
  if (bytes.length > MAX_IMAGE_BYTES) {
    throw new Error('Image is too large. Please use one under 2 MB.');
  }

  const ext = ALLOWED_IMAGE_MIME[mime];
  const safeName = String(p.imageFilename || '').replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 80) || ('sticky.' + ext);
  const blob = Utilities.newBlob(bytes, mime, safeName);

  const folder = getOrCreateImagesFolder();
  const file = folder.createFile(blob);
  try {
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  } catch (err) {
    // Sharing may be restricted by domain policy; the file is still stored.
  }

  const fileId = file.getId();
  return {
    fileId: fileId,
    url: 'https://drive.google.com/thumbnail?id=' + fileId + '&sz=w1200'
  };
}

function tryTrashFile(fileId) {
  try {
    DriveApp.getFileById(fileId).setTrashed(true);
  } catch (err) {
    // File may already be gone — ignore.
  }
}

function getOrCreateImagesFolder() {
  const props = PropertiesService.getScriptProperties();
  const configured = props.getProperty('IMAGES_FOLDER_ID');
  if (configured) {
    try { return DriveApp.getFolderById(configured); }
    catch (err) { /* fall through to create */ }
  }
  const existing = DriveApp.getFoldersByName(IMAGES_FOLDER_NAME);
  if (existing.hasNext()) {
    const folder = existing.next();
    props.setProperty('IMAGES_FOLDER_ID', folder.getId());
    return folder;
  }
  const created = DriveApp.createFolder(IMAGES_FOLDER_NAME);
  props.setProperty('IMAGES_FOLDER_ID', created.getId());
  return created;
}

function getOrCreateSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(SHEET_NAME);
  ensureHeaders(sheet);
  return sheet;
}

function ensureHeaders(sheet) {
  const lastCol = Math.max(sheet.getLastColumn(), 1);
  const width = Math.max(lastCol, SHEET_HEADERS.length);
  const current = sheet.getRange(1, 1, 1, width).getValues()[0];

  // v1 schema (pre-image, 11 cols): insert imageFileId, imageUrl, likers before lastUpdated.
  const V1_HEADERS = ['id','timestamp','note','displayName','category','color','x','y','status','adminNote','lastUpdated'];
  if (V1_HEADERS.every(function (h, i) { return current[i] === h; })) {
    sheet.insertColumnsBefore(11, 3);
    sheet.getRange(1, 1, 1, SHEET_HEADERS.length).setValues([SHEET_HEADERS]);
    sheet.setFrozenRows(1);
    return;
  }

  // v2 schema (pre-likes, 13 cols): insert likers before lastUpdated.
  const V2_HEADERS = ['id','timestamp','note','displayName','category','color','x','y','status','adminNote','imageFileId','imageUrl','lastUpdated'];
  if (V2_HEADERS.every(function (h, i) { return current[i] === h; })) {
    sheet.insertColumnsBefore(13, 1);
    sheet.getRange(1, 1, 1, SHEET_HEADERS.length).setValues([SHEET_HEADERS]);
    sheet.setFrozenRows(1);
    return;
  }

  const needsRewrite = SHEET_HEADERS.some(function (h, i) { return current[i] !== h; });
  if (needsRewrite) {
    sheet.getRange(1, 1, 1, SHEET_HEADERS.length).setValues([SHEET_HEADERS]);
    sheet.setFrozenRows(1);
  }
}

function appendRow(sheet, row) {
  sheet.appendRow(SHEET_HEADERS.map(function (h) { return row[h] !== undefined ? row[h] : ''; }));
}

function readSheet(sheet) {
  ensureHeaders(sheet);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  const values = sheet.getRange(2, 1, lastRow - 1, SHEET_HEADERS.length).getValues();
  return values.map(function (row) {
    const obj = {};
    SHEET_HEADERS.forEach(function (h, i) { obj[h] = row[i]; });
    return obj;
  });
}

function findRowById(sheet, id) {
  ensureHeaders(sheet);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return null;
  const ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  for (let i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === id) {
      return { rowIndex: i + 2, headers: SHEET_HEADERS };
    }
  }
  return null;
}

function setCell(sheet, found, header, value) {
  const col = found.headers.indexOf(header) + 1;
  if (col <= 0) throw new Error('Missing column: ' + header);
  sheet.getRange(found.rowIndex, col).setValue(value);
}

function getCell(sheet, found, header) {
  const col = found.headers.indexOf(header) + 1;
  if (col <= 0) throw new Error('Missing column: ' + header);
  return sheet.getRange(found.rowIndex, col).getValue();
}

function publicNote(n, clientId) {
  const likers = parseLikers(n.likers);
  return {
    id: n.id,
    timestamp: n.timestamp,
    note: n.note,
    displayName: n.displayName,
    category: n.category,
    color: n.color,
    x: Number(n.x || 10),
    y: Number(n.y || 10),
    imageUrl: n.imageUrl || '',
    likeCount: likers.length,
    likedByMe: clientId ? likers.indexOf(clientId) !== -1 : false
  };
}

function rssFeed() {
  const notes = readSheet(getOrCreateSheet())
    .filter(function (n) { return n.id && n.status === 'approved'; })
    .sort(function (a, b) { return new Date(b.timestamp) - new Date(a.timestamp); })
    .slice(0, 50);

  const settings = publicSettings();
  const title = settings.boardTitle ? ('StickyBoard - ' + settings.boardTitle) : 'StickyBoard';
  const description = settings.boardDescription || 'Latest sticky notes from this StickyBoard.';
  const webUrl = ScriptApp.getService().getUrl() || '';
  const updated = notes.length ? new Date(notes[0].timestamp).toISOString() : new Date().toISOString();

  const entries = notes.map(function (n) {
    const itemUrl = webUrl + '#note-' + encodeURIComponent(n.id);
    const author = n.displayName || 'Anonymous';
    const ts = new Date(n.timestamp).toISOString();
    const likeCount = parseLikers(n.likers).length;
    const html = noteHtmlForFeed(n, likeCount);
    const itemTitle = excerptForTitle(n.note);
    return '<entry>' +
      '<id>urn:uuid:' + xmlEscape(n.id) + '</id>' +
      '<title>' + xmlEscape(itemTitle) + '</title>' +
      '<link href="' + xmlEscape(itemUrl) + '"/>' +
      '<published>' + xmlEscape(ts) + '</published>' +
      '<updated>' + xmlEscape(ts) + '</updated>' +
      '<author><name>' + xmlEscape(author) + '</name></author>' +
      '<category term="' + xmlEscape(n.category || 'General') + '"/>' +
      '<content type="html">' + xmlEscape(html) + '</content>' +
    '</entry>';
  }).join('');

  const xml = '<?xml version="1.0" encoding="utf-8"?>' +
    '<feed xmlns="http://www.w3.org/2005/Atom">' +
      '<title>' + xmlEscape(title) + '</title>' +
      '<subtitle>' + xmlEscape(description) + '</subtitle>' +
      '<link href="' + xmlEscape(webUrl) + '"/>' +
      '<link rel="self" href="' + xmlEscape(webUrl + '?action=rss') + '"/>' +
      '<id>urn:stickyboard:' + xmlEscape(webUrl || PROJECT_NAME) + '</id>' +
      '<updated>' + xmlEscape(updated) + '</updated>' +
      entries +
    '</feed>';

  return ContentService.createTextOutput(xml).setMimeType(ContentService.MimeType.ATOM);
}

function noteHtmlForFeed(n, likeCount) {
  const parts = [];
  if (n.imageUrl) {
    parts.push('<p><img src="' + htmlEscape(n.imageUrl) + '" alt="" style="max-width:100%;height:auto"/></p>');
  }
  parts.push('<p>' + htmlEscape(String(n.note || '')).replace(/\n/g, '<br/>') + '</p>');
  const meta = htmlEscape(n.displayName || 'Anonymous') + ' &middot; ' + htmlEscape(n.category || 'General') +
    ' &middot; ' + (likeCount || 0) + ' ' + ((likeCount === 1) ? 'like' : 'likes');
  parts.push('<p><small>' + meta + '</small></p>');
  return parts.join('');
}

function excerptForTitle(text) {
  const flat = String(text || '').replace(/\s+/g, ' ').trim();
  return flat.length > 80 ? flat.slice(0, 77) + '...' : (flat || 'Sticky note');
}

function cleanText(value) {
  return String(value || '')
    .replace(/<[^>]*>/g, '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanMarkdown(value) {
  return String(value || '')
    .replace(/<[^>]*>/g, '')
    .replace(/\r\n?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+\n/g, '\n')
    .trim();
}

function clampNumber(value, min, max, fallback) {
  const n = Number(value);
  if (isNaN(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n * 100) / 100));
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomColor() {
  return ALLOWED_COLORS[randomInt(0, ALLOWED_COLORS.length - 1)];
}

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function htmlEscape(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function xmlEscape(str) {
  return htmlEscape(str);
}

function errorMessage(err) {
  return err && err.message ? err.message : String(err);
}
