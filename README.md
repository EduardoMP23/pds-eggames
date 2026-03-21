# Board Games Multiplayer

Plataforma de jogos de tabuleiro multiplayer em tempo real. Sem cadastro — só digite um nome e jogue.

**Jogos:** Xadrez · Exploding Kittens · Coup · Hive

## Deploy (Railway — recomendado)

> ⚠️ **Vercel não é compatível** com este projeto pois usa WebSockets e estado em memória. Use Railway ou Render.

### Railway
1. Acesse [railway.app](https://railway.app) e faça login com GitHub
2. Clique em **New Project → Deploy from GitHub repo**
3. Selecione este repositório
4. O Railway detecta automaticamente o `package.json` e roda `npm start`
5. Vá em **Settings → Networking → Generate Domain** para obter a URL pública

### Render
1. Acesse [render.com](https://render.com) e faça login com GitHub
2. Clique em **New → Web Service**
3. Selecione o repositório
4. Configure:
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
5. Clique em **Create Web Service**

## Desenvolvimento local

```bash
npm install
npm start
# Acesse http://localhost:3000
```

## Stack
- **Backend:** Node.js + Express + Socket.io
- **Frontend:** HTML/CSS/JS puro (sem framework)
- **Estado:** memória (sem banco de dados)
