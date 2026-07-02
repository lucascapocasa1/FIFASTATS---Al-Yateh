# ⚽ FIFA Clubes Pro — Stats Tracker

Aplicación web para procesar screenshots de la pantalla de **Rendimiento** del FIFA Clubes Pro, extraer estadísticas con OCR y visualizarlas en dashboards, rankings y comparativas entre jugadores.

---

## 📁 Estructura del Proyecto

```
fifa-stats/
├── backend/
│   ├── server.js            → Servidor Express (API + frontend estático)
│   ├── routes.js            → Endpoints REST
│   ├── db.js                → Selector automático: PostgreSQL (prod) o SQLite (local)
│   ├── db-pg.js             → Implementación PostgreSQL
│   ├── db-sqlite.js         → Implementación SQLite (sql.js)
│   ├── ocr.js               → OCR con Tesseract.js
│   ├── parser.js            → Parseo de texto OCR + normalización de nombres
│   ├── imageProcessor.js    → Recorte de zonas de la imagen
│   ├── uploads/             → Imágenes subidas por partido
│   ├── .env                 → Variables de entorno
│   └── package.json
├── frontend/
│   ├── index.html
│   ├── style.css
│   └── app.js               → Toda la lógica del cliente
├── Dockerfile               → Build para Render / producción
├── render.yaml              → Config para Render Blueprint
└── .dockerignore
```

---

## 🚀 Cómo Correr en Local

### 1. Requisitos

- **Node.js 18+**
- **PostgreSQL** (opcional — si no tenés, usa SQLite automáticamente)

### 2. Instalar dependencias

```bash
cd backend
npm install
```

### 3. Configurar base de datos

**Opción A — SQLite (automático, sin setup):**
No hace nada. Crea y persiste en `backend/fifa_stats.db`.

**Opción B — PostgreSQL:**
Creá una base de datos llamada `fifa_stats` y agregá al `backend/.env`:

```
DATABASE_URL=postgresql://postgres:TU_PASS@localhost:5432/fifa_stats
```

### 4. Iniciar el backend

```bash
cd backend
npm start
```

El backend sirve tanto la API como los archivos del frontend:
```
✅ Servidor FIFA Stats corriendo en http://localhost:3001
```

Abrí `http://localhost:3001` en el navegador.

---

## 📋 Funcionalidades

### Pestañas
| Tab | Descripción |
|-----|-------------|
| **Inicio** | Último partido, racha de resultados, leader destacado, gráfico de rendimiento del equipo |
| **Subir** | Drag & drop de screenshots → OCR → revisión → guardar |
| **Dashboard** | Evolución por jugador (línea), perfil (radar), comparación (barras) + tabla head-to-head |
| **Ranking** | Tabla completa con todos los jugadores, ordenable por cualquier stat |
| **Historial** | Todos los partidos con búsqueda, filtro por temporada, edición y export CSV |
| **Jugador** | Estadísticas individuales: resumen, evolución, perfil radar, export CSV |

### Características
- Reconocimiento automático de nombres con fuzzy matching (ej: "facundo" → "Facu")
- Temporadas editables (texto libre: "2da Division", "Amistoso", etc.)
- Edición de stats y datos del partido post-guardado
- Exportación a CSV (partido y jugador)
- Comparativa head-to-head con tabla de promedios y ganador por stat
- Galería de imágenes por partido
- Modo oscuro / claro
- Checkboxes MVP IG y PART IG por jugador
- Notas y detalle de goles por partido

---

## 🌐 API Endpoints

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| POST | `/api/upload` | Sube imágenes y devuelve stats parseadas |
| POST | `/api/save` | Guarda stats de un jugador |
| POST | `/api/match` | Crea un nuevo partido |
| GET | `/api/matches` | Lista partidos (filtro por `?season=`) |
| GET | `/api/match/:id` | Partido con stats |
| PUT | `/api/match/:id` | Actualiza datos del partido |
| DELETE | `/api/match/:id` | Elimina partido |
| POST | `/api/match/:id/images` | Sube imágenes a un partido |
| DELETE | `/api/match/:id/images/:filename` | Elimina una imagen |
| GET | `/api/stats` | Todas las estadísticas |
| PUT | `/api/stats/:id` | Actualiza una estadística |
| DELETE | `/api/stats/:id` | Elimina una estadística |
| GET | `/api/stats/player/:name` | Stats de un jugador |
| GET | `/api/leaderboard` | Ranking de jugadores |
| GET | `/api/players` | Lista de jugadores |
| GET | `/api/seasons` | Temporadas existentes |
| GET | `/api/team/summary` | Resumen por partido del equipo |
| GET | `/api/health` | Health check |

---

## ☁️ Deploy en Render + Supabase

### Arquitectura

```
Usuario → Render (Web Service: frontend + API) → Supabase (PostgreSQL)
```

### Pasos

1. **Subir a GitHub**
   ```bash
   git add .
   git commit -m "ready for deploy"
   git remote add origin https://github.com/TU_USUARIO/fifa-stats.git
   git push -u origin main
   ```

2. **Crear base de datos en Supabase**
   - [supabase.com](https://supabase.com) → New Project
   - Guardar la **Connection String** (URI)
   - Opciones: Data API ON, expose new tables OFF, RLS OFF

3. **Crear Web Service en Render**
   - [dashboard.render.com](https://dashboard.render.com) → New + → Web Service
   - Connectar repo de GitHub
   - Environment: **Docker**
   - Plan: **Free**
   - Variable de entorno: `DATABASE_URL` = URI de Supabase
   - Variable de entorno: `NODE_ENV` = `production`

4. **Listo**
   - Render build + deploy automático
   - Las tablas se crean solas al primer request
   - URL: `https://fifa-stats.onrender.com`

### Costo: $0/mes

| Servicio | Plan |
|----------|------|
| Render Web Service | Free (se duerme a los 15 min) |
| Supabase PostgreSQL | Free (500MB datos, 5GB transferencia) |

---

## 🔧 Troubleshooting

### El OCR no detecta bien el nombre
- Revisá el **debug OCR** (desplegable en cada resultado)
- Se puede editar manualmente en el dropdown
- El fuzzy matching corrige automáticamente variaciones (facundo → Facu)

### Los valores aparecen como `null`
- Usá screenshots a resolución nativa
- Revisá el texto OCR crudo en el panel de debug

### Error "The server does not support SSL connections"
- PostgreSQL local sin SSL: asegurate que no haya `DATABASE_URL` en `.env`, o comentala

### La primera imagen tarda mucho
- Tesseract.js descarga el modelo de idioma español (~30MB) la primera vez

### Las APIs devuelven 500
- Revisá la terminal del backend para ver el error exacto
- Si usás PostgreSQL local, verificá que esté corriendo y la DB exista
- Si usás Supabase, verificá la `DATABASE_URL`
