import { createApp } from './app.js';
const app = await createApp();
const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Site + API on http://localhost:${port}`));
