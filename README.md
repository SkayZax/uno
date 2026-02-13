# 🎴 UNO Multijoueur - Node.js + Socket.IO

Un jeu UNO multijoueur en temps réel avec un serveur Node.js et Socket.IO.

## 📋 Prérequis

- Node.js (version 14 ou supérieure)
- npm (inclus avec Node.js)

## 🚀 Installation locale

1. **Téléchargez tous les fichiers** sur votre ordinateur dans un dossier (ex: `uno-game`)

2. **Structure des fichiers** :
   ```
   uno-game/
   ├── server.js
   ├── package.json
   └── public/
       └── index.html
   ```

3. **Ouvrez un terminal** dans le dossier `uno-game`

4. **Installez les dépendances** :
   ```bash
   npm install
   ```

5. **Lancez le serveur** :
   ```bash
   npm start
   ```

6. **Ouvrez votre navigateur** et allez sur :
   ```
   http://localhost:3000
   ```

7. **C'est prêt !** 🎉

## 🌐 Jouer en ligne avec vos amis

### Sur votre réseau local (même WiFi) :

1. Lancez le serveur sur votre ordinateur
2. Trouvez votre adresse IP locale :
   - **Windows** : `ipconfig` dans le terminal
   - **Mac/Linux** : `ifconfig` ou `ip addr`
3. Partagez l'URL à vos amis : `http://VOTRE-IP:3000`
   - Exemple : `http://192.168.1.100:3000`

### Sur Internet (hébergement) :

Vous avez plusieurs options :

#### Option 1 : Heroku (Gratuit)

1. **Créez un compte** sur [heroku.com](https://heroku.com)

2. **Installez Heroku CLI** : [instructions](https://devcenter.heroku.com/articles/heroku-cli)

3. **Dans votre dossier uno-game** :
   ```bash
   # Connexion à Heroku
   heroku login

   # Créer une application
   heroku create mon-jeu-uno

   # Initialiser Git (si pas déjà fait)
   git init
   git add .
   git commit -m "Initial commit"

   # Déployer
   git push heroku main
   ```

4. **Votre jeu sera accessible** sur : `https://mon-jeu-uno.herokuapp.com`

#### Option 2 : Railway (Gratuit)

1. **Allez sur** [railway.app](https://railway.app)
2. **Connectez-vous** avec GitHub
3. **New Project** → Deploy from GitHub
4. **Sélectionnez votre repo** (uploadez d'abord sur GitHub)
5. Railway détecte automatiquement Node.js et déploie !

#### Option 3 : Render (Gratuit)

1. **Créez un compte** sur [render.com](https://render.com)
2. **New** → **Web Service**
3. **Connectez votre repo GitHub** ou uploadez le code
4. Render déploie automatiquement !

#### Option 4 : Votre propre serveur VPS

Si vous avez un serveur (Ubuntu/Debian) :

```bash
# Sur votre serveur
cd /var/www
git clone [votre-repo]
cd uno-game
npm install

# Installer PM2 pour garder le serveur actif
npm install -g pm2
pm2 start server.js --name "uno-game"
pm2 save
pm2 startup

# Configurer Nginx (optionnel)
sudo nano /etc/nginx/sites-available/uno

# Ajoutez cette configuration :
server {
    listen 80;
    server_name votre-domaine.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}

# Activez le site
sudo ln -s /etc/nginx/sites-available/uno /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

## 🎮 Comment jouer

1. **Créez une salle** et notez le code (ex: ABC123)
2. **Partagez le code** avec vos amis
3. **Vos amis rejoignent** avec le code
4. **L'hôte démarre** la partie (minimum 2 joueurs)
5. **Jouez !** Cliquez sur vos cartes pour les jouer

## 🛠️ Configuration

### Changer le port

Dans `server.js`, modifiez :
```javascript
const PORT = process.env.PORT || 3000; // Changez 3000 par le port souhaité
```

### Mode développement avec auto-reload

```bash
npm run dev
```

## 📦 Dépendances

- **express** : Serveur web
- **socket.io** : Communication en temps réel WebSocket

## 🐛 Dépannage

### Le jeu ne se connecte pas ?

- Vérifiez que le serveur est bien lancé
- Vérifiez votre pare-feu (port 3000 doit être ouvert)
- Vérifiez l'URL (http:// et non https://)

### Problème de synchronisation ?

- Actualisez la page (F5)
- Vérifiez votre connexion internet

### Sur Heroku/Railway : "Application Error" ?

- Assurez-vous que `package.json` contient le bon script `start`
- Vérifiez que le port utilise `process.env.PORT`

## 📝 Notes

- Les salles sont stockées en mémoire et disparaissent au redémarrage du serveur
- Chaque salle peut accueillir jusqu'à 10 joueurs (configurable)
- Les cartes sont mélangées aléatoirement à chaque partie

## 🎉 Amusez-vous bien !

Créé avec ❤️ en Node.js et Socket.IO
