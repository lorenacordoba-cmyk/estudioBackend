// Variables de prueba: NUNCA se utilizan para envíos reales ni peticiones a Groq.
process.env.NODE_ENV = 'test';
process.env.GROQ_API_KEY ||= 'gsk_test_only_not_real';
process.env.SECURITY_HASH_SECRET ||= 'esta-es-una-clave-de-prueba-de-mas-de-32-caracteres';
process.env.SMTP_HOST ||= 'localhost';
process.env.SMTP_USER ||= 'test@example.com';
process.env.SMTP_PASS ||= 'test_only_no_real_send';
