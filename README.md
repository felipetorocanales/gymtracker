# Gym Tracker Pro 🏋️‍♂️🏃‍♂️🚴‍♂️

Gym Tracker Pro es una aplicación web moderna, responsiva y de alto rendimiento diseñada para registrar y analizar tus sesiones de entrenamiento físico. Permite llevar el control tanto de ejercicios de fuerza (gimnasio) como de actividades cardiovasculares (trote y ciclismo), integrándose directamente con **Strava** y utilizando **Firebase** para la persistencia de datos.

## ✨ Características Principales

*   **💪 Registro de Fuerza:** Organiza tus entrenamientos por días y ejercicios personalizados. Registra series, repeticiones y peso.
*   **🏃 Trote (Running):** 
    *   Modo **Calle (GPS)** con seguimiento en tiempo real y cálculo de ritmo (min/km).
    *   Modo **Cinta (Máquina)** para ingresar la distancia manualmente tras finalizar.
*   **🚴 Ciclismo (Cycling):**
    *   Modo **Aire Libre (GPS)** con cálculo de velocidad y distancia.
    *   Modo **Indoor** para registrar entrenamientos bajo techo.
*   **⚡ Integración con Strava:** Sincroniza tus actividades de trote y ciclismo directamente con tu cuenta de Strava de manera automática a través del flujo OAuth integrado.
*   **📊 Gráficos de Progreso:** Visualización del volumen de entrenamiento y estimación de fuerza máxima (1RM) a lo largo de las semanas/meses usando *Chart.js*.
*   **🔒 Autenticación y Nube:** Login rápido por correo electrónico y almacenamiento en la nube en tiempo real mediante *Firebase Auth* y *Firestore*.
*   **🎨 Diseño Premium:** Interfaz oscura elegante con efectos de Glassmorphism (vidrio esmerilado), degradados modernos, animaciones fluidas y optimización completa para dispositivos móviles.

---

## 🛠️ Requisitos Previos

Necesitas tener instalado al menos uno de los siguientes en tu computadora:
*   [Node.js](https://nodejs.org/) (recomendado v18 o superior)
*   [Python](https://www.python.org/) (v3.x)

---

## 🚀 Cómo Ejecutar en Local

Puedes levantar un servidor de desarrollo rápido utilizando cualquiera de estas opciones dentro de la carpeta del proyecto:

### Opción 1: Con Python (Recomendado/Sin descargas)
Ejecuta el siguiente comando en la terminal:
```bash
python -m http.server 8000
```
Luego abre en tu navegador: [http://localhost:8000](http://localhost:8000)

### Opción 2: Con Node.js (npx)
Si prefieres usar Node.js para servir la página:
```bash
npx serve .
```
Luego abre el puerto que te indique la terminal (por lo general [http://localhost:3000](http://localhost:3000)).

---

## ⚙️ Configuración e Integraciones

### 1. Firebase (Base de Datos y Auth)
El proyecto utiliza Firebase en el cliente. La configuración del proyecto se encuentra al inicio de `app.js`:
```javascript
const firebaseConfig = {
    apiKey: "TU_API_KEY",
    authDomain: "TU_AUTH_DOMAIN",
    projectId: "TU_PROJECT_ID",
    storageBucket: "TU_STORAGE_BUCKET",
    messagingSenderId: "TU_SENDER_ID",
    appId: "TU_APP_ID"
};
```

### 2. Strava API (OAuth)
La integración con Strava se realiza mediante OAuth 2.0 directamente desde la aplicación web:
*   **Redirección de login:** Envía al usuario a Strava para autorizar permisos (`read,activity:read,activity:read_all`).
*   **Intercambio de Tokens:** Obtiene el token de acceso y actualización directamente en el cliente usando el `client_id` y `client_secret` configurados en las funciones `handleStravaConnect` y `handleStravaCallback` dentro de `app.js`.

---

## ☁️ Despliegue (Hosting)

El proyecto viene preconfigurado para ser desplegado en **Firebase Hosting**. Para subir una nueva versión:

1. Asegúrate de tener instalado el CLI de Firebase:
   ```bash
   npm install -g firebase-tools
   ```
2. Inicia sesión en Firebase:
   ```bash
   firebase login
   ```
3. Despliega la aplicación:
   ```bash
   firebase deploy
   ```

---

## 📁 Estructura del Proyecto

```
GymTracker/
├── .firebase/            # Caché de Firebase
├── .gitignore            # Archivos ignorados por Git
├── .firebaserc           # Asociación de proyecto Firebase
├── firebase.json         # Configuración de Firebase Hosting
├── index.html            # Estructura principal y pantallas
├── style.css             # Estilos CSS premium y responsivos
├── app.js                # Lógica de la aplicación, Firebase y Strava
├── 404.html              # Página de error 404 para Firebase Hosting
├── logo.png              # Logo de la app
└── README.md             # Documentación del proyecto (Este archivo)
```
