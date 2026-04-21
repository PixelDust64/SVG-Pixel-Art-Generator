<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# 🎨 SVG Pixel Art Generator

A web application to generate **pixel art in SVG format using AI**, supporting both online and local models.

---

## 🚀 Features

* Generate pixel art from text prompts
* Export as SVG
* Select different resolutions
* Support for:

  * 🌐 Online API (Gemini)
  * 💻 Local models via LM Studio

---

## 🛠️ Tech Stack

* React + TypeScript
* Vite
* AI integration (Gemini / Local Models)

---

## ▶️ Run Locally

### Prerequisites

* Node.js installed

---

### 1. Install dependencies

```bash id="zj6c2h"
npm install
```

---

### 2. Choose how you want to run

#### 🔹 Option A — Use API (Gemini)

Create a `.env.local` file in the project root:

```env id="7t7u5g"
GEMINI_API_KEY=your_api_key_here
```

---

#### 🔹 Option B — Use local models (LM Studio)

* Install and run LM Studio
* Start the local server (e.g., `http://localhost:1234`)
* Select the model inside the app

---

### 3. Start the app

```bash id="9avtqk"
npm run dev
```

Then open:

```id="9z4g6m"
http://localhost:3000/
```

---

## ⚠️ Notes

* API key is not required if using local models
* Make sure LM Studio is running before generating images
* Performance depends on the selected model

---

## 📌 About

This project was created to make AI-powered pixel art generation simple, fast, and flexible, allowing both online and offline usage.

---

## 📄 License

MIT
