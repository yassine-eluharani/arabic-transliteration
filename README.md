# Arabic Transliteration for Obsidian

Type Arabic using Latin letters — automatically converted as you type.

This plugin allows you to write Arabic in Obsidian **without switching keyboard layouts**, using a fast and customizable transliteration system.

---

## ✨ Features

- ✅ Auto‑convert on space or Enter  
- ✅ Works while typing (no command needed)  
- ✅ Customizable transliteration rules  
- ✅ Status bar ON / OFF toggle  
- ✅ Designed for Modern Standard Arabic  
- ✅ Works offline  
- ✅ Lightweight and fast  

---

## 🚀 Example

Type:
```
alsalam 3alaykom
```

Press **space** →

```
السلام عليكم
```

---

## ⚙️ Features Overview

### 🔹 Auto Transliteration
Automatically converts the last word when you press **space** or **enter**.

### 🔹 Status Bar Toggle
Click the status bar item to enable or disable:

```
AR Transliteration: ON / OFF
```

### 🔹 Custom Rules
You can define your own letter mappings:

```json
[
  { "from": "sh", "to": "ش" },
  { "from": "kh", "to": "خ" },
  { "from": "3", "to": "ع" },
  { "from": "a", "to": "ا" }
]
```

No dictionary required — purely letter‑based.

---

## 🧠 Use Cases

- Arabic note‑taking
- Students learning Arabic
- Writers who don’t want to switch keyboard layouts
- Knowledge bases in Arabic
- Fast typing for journaling or research

---

## 🛠 Commands

| Command | Description |
|------|------|
| Toggle Arabic Transliteration | Enable / disable the plugin |
| Convert Selection | Convert selected text manually |

---

## 📦 Installation (Manual)

1. Download this repository
2. Copy it to:

```
.obsidian/plugins/arabic-transliteration
```

3. Enable the plugin from:
**Settings → Community Plugins**

---

## 🧩 Development

```bash
npm install
npm run build
```

Then copy:

```
dist/main.js → .obsidian/plugins/arabic-transliteration/main.js
```

---

## 🔐 Privacy

✔ Works offline  
✔ No tracking  
✔ No analytics  
✔ No network calls  

---

## 📄 License

MIT License

---

## 🙌 Author

Built by **Yassine**
Feel free to contribute or open issues.
