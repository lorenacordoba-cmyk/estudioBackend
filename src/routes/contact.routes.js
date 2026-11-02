import { submitContact } from '../controllers/contact.controller.js';
export async function contactRoutes(app) { app.post('/', submitContact); }
