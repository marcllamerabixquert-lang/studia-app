// Vercel Serverless Function: procesa apuntes con IA sin exponer la clave al navegador.
const MAX_IMAGES = 6;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido.' });
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ error: 'Inicia sesión en Studia.' });
  const supabaseUrl = process.env.SUPABASE_URL || 'https://acyeqgluaewlgkdnkjqu.supabase.co';
  const supabaseKey = process.env.SUPABASE_ANON_KEY || 'sb_publishable_WTjBZoO6EesY3jIS8gIfxg_wZ8f62-x';
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return res.status(503).json({ error: 'La función de IA está preparada, pero falta añadir OPENAI_API_KEY en Vercel.' });
  let auth;
  try {
    auth = await fetch(supabaseUrl.replace(/\/$/, '') + '/auth/v1/user', { headers: { apikey: supabaseKey, Authorization: 'Bearer ' + token } });
  } catch (_) { return res.status(502).json({ error: 'No se pudo verificar la sesión.' }); }
  if (!auth.ok) return res.status(401).json({ error: 'Tu sesión ha caducado. Vuelve a iniciar sesión.' });
  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (_) { return res.status(400).json({ error: 'Solicitud no válida.' }); } }
  body = body || {};
  const action = body.action;
  if (!['summary', 'quiz', 'grade'].includes(action)) return res.status(400).json({ error: 'Acción no válida.' });
  if (!Array.isArray(body.images) || body.images.length < 1 || body.images.length > MAX_IMAGES) return res.status(400).json({ error: 'Selecciona entre 1 y 6 fotos.' });
  const images = [];
  for (const image of body.images) {
    if (!image || !['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(image.mimeType) || typeof image.dataUrl !== 'string') return res.status(400).json({ error: 'Formato de imagen no compatible. Usa JPG, PNG o WebP.' });
    const match = image.dataUrl.match(/^data:(image\/(?:jpeg|png|webp|gif));base64,([A-Za-z0-9+/=]+)$/);
    if (!match || match[1] !== image.mimeType || Math.floor(match[2].length * 3 / 4) > MAX_IMAGE_BYTES) return res.status(400).json({ error: 'Cada foto debe ser válida y pesar menos de 8 MB.' });
    images.push({ type: 'input_image', image_url: image.dataUrl });
  }
  const subject = String(body.subject || 'la asignatura').slice(0, 80);
  const level = body.level === 'simple' ? 'Explica con lenguaje sencillo y ejemplos.' : body.level === 'deep' ? 'Incluye detalle, conexiones y matices importantes.' : 'Da un nivel de detalle equilibrado y claro.';
  let instruction;
  if (action === 'summary') instruction = 'Crea un resumen de estudio en español a partir de estas fotos de apuntes/libro. Organiza por títulos, explica conceptos, define vocabulario y termina con 5 ideas clave y 5 preguntas de repaso. Asignatura: ' + subject + '. ' + level;
  if (action === 'quiz') instruction = 'Crea un test en español basado exclusivamente en estas fotos para la asignatura ' + subject + '. Haz 8 preguntas variadas (opción múltiple y respuesta breve), numeradas. No incluyas las soluciones todavía. Termina indicando cómo responder.';
  if (action === 'grade') instruction = 'Corrige con amabilidad las respuestas del alumno al test sobre ' + subject + '. Test previo: ' + String(body.previousQuiz || '(no se ha incluido el test previo)').slice(0, 10000) + '. Respuestas del alumno: ' + String(body.answers || '').slice(0, 10000) + '. Usa las fotos como fuente, marca cada respuesta como correcta/parcial/por revisar, explica brevemente las correcciones y acaba con 3 conceptos concretos que conviene repasar. No inventes una nota si no hay información suficiente.';
  try {
    const ai = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + apiKey },
      body: JSON.stringify({ model: 'gpt-4.1-mini', instructions: 'Eres el tutor educativo de Studia. Responde en español, sé claro y pedagógico, no inventes contenido ilegible y señala cuando una foto no se pueda leer. No pidas datos personales.', input: [{ role: 'user', content: [{ type: 'input_text', text: instruction }, ...images] }], max_output_tokens: 3500 })
    });
    const result = await ai.json();
    if (!ai.ok) return res.status(502).json({ error: 'El servicio de IA no ha podido procesar las fotos. Inténtalo de nuevo más tarde.' });
    const text = (result.output || []).flatMap(item => item.content || []).filter(item => item.type === 'output_text').map(item => item.text).join('\n').trim();
    if (!text) return res.status(502).json({ error: 'La IA no devolvió texto. Prueba con fotos más nítidas.' });
    return res.status(200).json({ text });
  } catch (_) { return res.status(502).json({ error: 'No se ha podido conectar con el servicio de IA.' }); }
};
