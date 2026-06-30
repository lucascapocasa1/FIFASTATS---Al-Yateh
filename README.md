# ⚽ FIFA Clubes Pro — Stats Tracker

Aplicación web para procesar screenshots de la pantalla de **Rendimiento** del FIFA Clubes Pro y extraer las estadísticas de cada jugador automáticamente con OCR.

---

## 📁 Estructura del Proyecto

```
fifa-stats/
├── backend/
│   ├── server.js          → Servidor Express principal
│   ├── routes.js          → Endpoints de la API
│   ├── ocr.js             → OCR con Tesseract.js
│   ├── parser.js          → Parseo de texto OCR a JSON
│   ├── imageProcessor.js  → Recorte de zonas de la imagen
│   ├── db.js              → Base de datos SQLite (sql.js)
│   ├── .env               → Variables de entorno
│   └── package.json
└── frontend/
    ├── index.html
    ├── style.css
    └── app.js
```

---

## 🚀 Cómo Correr en Local (VS Code)

### 1. Requisitos previos

- **Node.js 18+** → https://nodejs.org/
- **VS Code** con extensión **Live Server** (para el frontend)

### 2. Instalar dependencias del backend

Abrí una terminal en VS Code (`Ctrl + `` ` ``) y ejecutá:

```bash
cd backend
npm install
```

### 3. Iniciar el backend

```bash
cd backend
npm start
```

Deberías ver:
```
✅ Servidor FIFA Stats corriendo en http://localhost:3001
```

### 4. Iniciar el frontend

**Opción A — Live Server (recomendada):**
1. Abrí `frontend/index.html` en VS Code
2. Click derecho → **"Open with Live Server"**
3. Se abre en `http://localhost:5500` automáticamente

**Opción B — Abrir directo en el navegador:**
- Arrastrá `frontend/index.html` a tu navegador
- ⚠️ Algunas funciones pueden no andar por políticas CORS locales

---

## 📋 Cómo usar la app

1. **Subí imágenes** (drag & drop o click) → screenshots del FIFA, pantalla "Rendimiento"
2. Hacé click en **"Procesar imágenes"** → el OCR extrae las stats
3. Revisá los resultados (se muestra el JSON de cada jugador)
4. Si todo está bien, click en **"Guardar en base de datos"**
5. En la pestaña **"Historial"** podés ver todos los registros guardados

---

## 🌐 API Endpoints

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| POST | `/api/upload` | Sube imágenes y devuelve stats parseadas |
| POST | `/api/save` | Guarda stats en SQLite |
| GET | `/api/stats` | Devuelve historial completo |
| DELETE | `/api/stats/:id` | Elimina un registro |
| GET | `/api/health` | Health check |

---

## 📦 Ejemplo de respuesta JSON (`/api/upload`)

```json
{
  "total": 1,
  "exitosos": 1,
  "fallidos": 0,
  "results": [
    {
      "filename": "captura_lucasyjoaqui.png",
      "success": true,
      "data": {
        "jugador": "lucasyjoaqui",
        "goles": 5,
        "asistencias": 2,
        "tiros": 12,
        "precision_tiros": 75,
        "pases": 206,
        "precision_pases": 90,
        "regates": 148,
        "exito_regates": 91,
        "entradas": 24,
        "exito_entradas": 25,
        "fueras_de_juego": 1,
        "faltas": 2,
        "posesion_ganada": 27,
        "posesion_perdida": 32,
        "minutos_jugados": 92,
        "distancia_recorrida_km": 16.5,
        "distancia_sprint_km": 9.1,
        "valoracion": 8.4
      },
      "warnings": [],
      "errors": []
    }
  ]
}
```

---

## 🔧 Troubleshooting

### El OCR no detecta bien el nombre del jugador
- Revisá el **debug OCR** que aparece en cada resultado (hay un desplegable)
- Podés editar el nombre manualmente en el JSON antes de guardar (próxima versión)
- Asegurate que la imagen sea el screenshot completo, sin recortes

### Los valores aparecen como `null`
- Tesseract necesita buena resolución — usá screenshots a resolución nativa
- El texto OCR crudo aparece en el desplegable "debug" para que puedas diagnosticar

### Error de CORS
- Asegurate de abrir el frontend con Live Server (no directamente como archivo)
- Verificá que el backend esté corriendo en el puerto 3001

### La primera imagen tarda mucho
- Tesseract.js descarga el modelo de idioma español la primera vez (~30MB)
- Las siguientes son mucho más rápidas

---

## ☁️ Deploy en la Nube (cuando estés listo)

### Backend → Render.com
1. Subí el directorio `backend/` a un repositorio GitHub
2. En Render: New Web Service → conectá el repo
3. Build command: `npm install`
4. Start command: `npm start`
5. Variables de entorno: `FRONTEND_URL=https://tu-app.pages.dev`

### Frontend → Cloudflare Pages
1. Subí el directorio `frontend/` a GitHub
2. En Cloudflare Pages: conectá el repo
3. No requiere build command (HTML/CSS/JS estático)
4. Editá `API_URL` en `app.js` apuntando al backend de Render

---

## 📝 Notas sobre el parseo

Las estadísticas FIFA tienen formato **"equipo vs jugador"**:
```
Pases    13   206
```
El sistema siempre toma el **segundo número** (el del jugador).

Los porcentajes también:
```
Precisión en los pases (%)    85   90
```
→ Se guarda `90` (el del jugador).
