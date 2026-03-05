# 📋 Kompletní návod: Git + GitHub + Deploy

Vše už máš nastavené! Tady je přesný postup, jak nahrávat změny na GitHub a deployovat na `feedback.matanui.cz`.

---

## 🚀 Jednorázové nastavení (již hotové)

✅ Git repo inicializováno  
✅ Uživatel nastaven: `bndktsjn`  
✅ Deploy script opraven (`--env-file .env`)  
✅ První commit vytvořen  

---

## 📤 Jak nahrát na GitHub (první krát)

1. **Vytvoř repozitář na GitHubu**
   - Jdi na [github.com/new](https://github.com/new)
   - Repository name: `feedback.matanui.cz`
   - Public (nebo Private)
   - NEZAŠKRTÁVEJ "Initialize with README"
   - Klikni "Create repository"

2. **Propoj lokální repozitář s GitHubem**
   ```bash
   git remote add origin https://github.com/bndktsjn/feedback.matanui.cz.git
   git push -u origin main
   ```

---

## 🔄 Jak pracovat s kódem (každodenní workflow)

### Krok 1: Uprav kód
- Otevři VS Code
- Udělej změny v kódu
- Otestuj lokálně (`pnpm dev`)

### Krok 2: Ulož změny do Gitu
```bash
# Podívej se, co se změnilo
git status

# Přidej všechny změny
git add .

# Ulož s popisem
git commit -m "Fix login redirect loop"
```

### Krok 3: Nahrát na GitHub
```bash
git push
```

### Krok 4: Deploy na produkci
```bash
bash deploy.sh
```

---

## 🎯 Příklady commit zpráv

Dobré commit zprávy:
- `Fix login redirect loop`
- `Add user profile page`
- `Update Docker configuration`
- `Fix typo in README`

Špatné commit zprávy:
- `fix`
- `update`
- `asdf`
- `.`

---

## 🛠️ Co dělat, když něco nefunguje

### Git push selže
```bash
# Nejprve stáhni změny z GitHubu
git pull --rebase
# Potom zkus znovu push
git push
```

### Deploy selže
```bash
# Zkontroluj SSH připojení
ssh benedikt@100.97.158.52 "echo 'SSH works'"

# Zkontroluj .env soubor
ls -la .env
```

---

## 📁 Struktura souborů

```
feedback.matanui.cz/
├── .git/              # Git historie (automaticky)
├── .gitignore          # Co ignorovat (node_modules atd.)
├── deploy.sh           # Deploy script
├── apps/               # API a web kód
├── packages/           # Databáze a shared kód
├── infra/              # Docker konfigurace
└── .env                # Produkční proměnné (nenahrávat na GitHub!)
```

---

## 🚨 Důležité pravidla

1. **Nikdy nenahrávej `.env` na GitHub** (je v `.gitignore`)
2. **Vždy otestuj lokálně před deploy**
3. **Používej smysluplné commit zprávy**
4. **Deploy až po `git push`** (záloha na GitHubu)

---

## 🎉 Hotovo! Tvé první nasazení

Teď můžeš udělat první nasazení:

```bash
# 1. Vytvoř GitHub repozitář
# 2. Propoj s GitHubem:
git remote add origin https://github.com/bndktsjn/feedback.matanui.cz.git
git push -u origin main

# 3. Deploy na server:
bash deploy.sh
```

A je to! Od teď stačí jen `git add . && git commit && git push && bash deploy.sh`.
