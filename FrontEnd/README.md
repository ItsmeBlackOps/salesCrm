# Welcome to your Pulse CRM Dashboard

## Project info

**URL**: https://pulsecrm-pro.netlify.app/



**Use your preferred IDE**

The only requirement is having Node.js & npm installed - [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating)

Follow these steps:

```sh
# Step 1: Clone the repository using the project's Git URL.
git clone <YOUR_GIT_URL>

# Step 2: Navigate to the project directory.
cd <YOUR_PROJECT_NAME>

# Step 3: Install the necessary dependencies.
npm i

# Step 4: Start the development server with auto-reloading and an instant preview.
npm run dev
```

## Environment Variables

Create a `.env` file in the project root with the following variable pointing to your backend API:

```env
VITE_API_BASE_URL=http://localhost:3001
```

All API requests use this variable.

## Token Refresh Behavior

The `AuthProvider` stores both an access token and refresh token after a
successful login. The application expects your backend to expose a `POST
/refresh` endpoint that accepts the stored refresh token and returns a new pair
of tokens.

When any authenticated request returns `401`, `fetchWithAuth` will call
`refreshToken()` and retry the original request once. If refreshing also fails
with `401`, the user is logged out and local storage is cleared.

Ensure your backend implements `/refresh` for this workflow to succeed.

## What technologies are used for this project?

This project is built with:

- Vite
- TypeScript
- React
- shadcn-ui
- Tailwind CSS

