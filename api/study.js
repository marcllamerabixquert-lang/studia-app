
const MAX_IMAGES = 6;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido.' });
  }

  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) {
    return res.status(401).json({ error: 'Inicia sesión en Studia.' });
  }

  const supabaseUrl = process.env.SUPABASE_URL ||
    'https://acyeqgluaewlgkdnkjqu.supabase.co';
  const supabaseKey = process.env.SUPABASE_ANON_KEY ||
    'sb_publishable_WTjBZoO6EesY3jIS8gIfxg_wZ8f62-x';
  const apiKey = process.env.MISTRAL_API_KEY;

  if (!apiKey) {
    return res.status(503).json({
      error: 'Falta configurar MISTRAL_API_KEY en Vercel.'
    });
  }

  try {
    const auth = await fetch(
      supabaseUrl.replace(/\/$/, '') + '/auth/v1/user',
      {
        headers: {
          apikey: supabaseKey,
          Authorization: 'Bearer ' + token
        }
      }
    );

    if (!auth.ok) {
      return res.status(401).json({
        error: 'Tu sesión ha caducado. Vuelve a iniciar sesión.'
      });
    }
  } catch (_) {
    return res.status(502).json({
      error: 'No se pudo verificar la sesión.'
    });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch (_) {
      return res.status(400).json({ error: 'Solicitud no válida.' });
    }
  }
  body = body || {};

  const action = body.action;
  if (!['summary', 'quiz', 'grade'].includes(action)) {
    return res.status(400).json({ error: 'Acción no válida.' });
  }

  if (!Array.isArray(body.images) ||
      body.images.length < 1 ||
      body.images.length > MAX_IMAGES) {
    return res.status(400).json({
      error: 'Selecciona entre 1 y 6 fotos.'
    });
  }

  const images = [];

  for (const image of body.images) {
    if (
      !image ||
      !['image/jpeg', 'image/png', 'image/webp', 'image/gif']
        .includes(image.mimeType) ||
      typeof image.dataUrl !== 'string'
    ) {
      return res.status(400).json({
        error: 'Formato de imagen no compatible. Usa JPG, PNG o WebP.'
      });
    }

    const match = image.dataUrl.match(
      /^data:(image\/(?:jpeg|png|webp|gif));base64,([A-Za-z0-9+/=]+)$/
    );

    if (
      !match ||
      match[1] !== image.mimeType ||
      Math.floor(match[2].length * 3 / 4) > MAX_IMAGE_BYTES
    ) {
      return res.status(400).json({
        error: 'Cada foto debe ser válida y pesar menos de 8 MB.'
      });
    }

    images.push({
      type: 'image_url',
      image_url: image.dataUrl
    });
  }

  const subject = String(body.subject || 'la asignatura').slice(0, 80);
  const level = body.level === 'simple'
    ? 'Explica con lenguaje sencillo y ejemplos.'
    : body.level === 'deep'
      ? 'Incluye detalle, conexiones y matices importantes.'
      : 'Da un nivel de detalle equilibrado y claro.';

  let instruction;

  if (action === 'summary') {
    instruction =
      'Crea un resumen de estudio en español a partir de estas fotos ' +
      'de apuntes o libro. Organiza por títulos, explica conceptos, ' +
      'define vocabulario y termina con 5 ideas clave y 5 preguntas ' +
      'de repaso. Asignatura: ' + subject + '. ' + level;
  }

  if (action === 'quiz') {
    instruction =
      'Crea un test en español basado exclusivamente en estas fotos ' +
      'para la asignatura ' + subject + '. Haz 8 preguntas variadas, ' +
      'de opción múltiple y respuesta breve. No incluyas las soluciones. ' +
      'Termina indicando cómo responder.';
  }

  if (action === 'grade') {
    instruction =
      'Corrige con amabilidad las respuestas del alumno al test sobre ' +
      subject + '. Test previo: ' +
      String(body.previousQuiz || '(no incluido)').slice(0, 10000) +
      '. Respuestas del alumno: ' +
      String(body.answers || '').slice(0, 10000) +
      '. Usa las fotos como fuente, marca cada respuesta como ' +
      'correcta, parcial o por revisar, explica brevemente y acaba ' +
      'con 3 conceptos concretos que conviene repasar. No inventes ' +
      'una nota si no hay información suficiente.';
  }

  try {
    const ai = await fetch(
      'https://api.mistral.ai/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + apiKey
        },
        body: JSON.stringify({
          model: 'ministral-14b-latest',
          messages: [
            {
              role: 'system',
              content:
                'Eres el tutor educativo de Studia. Responde en español, ' +
                'sé claro y pedagógico, no inventes contenido ilegible ' +
                'y señala cuando una foto no se pueda leer. No pidas ' +
                'datos personales.'
            },
            {
              role: 'user',
              content: [
                { type: 'text', text: instruction },
                ...images
              ]
            }
          ],
          max_tokens: 3500
        })
      }
    );

    if (!ai.ok) {
      return res.status(502).json({
        error: 'Mistral no ha podido procesar las fotos. Comprueba la ' +
          'configuración y los límites de tu cuenta e inténtalo de nuevo.'
      });
    }

    const result = await ai.json();
    const content = result.choices?.[0]?.message?.content;
    const text = (
      typeof content === 'string'
        ? content
        : Array.isArray(content)
          ? content
              .filter(item => item && item.type === 'text')
              .map(item => item.text || '')
              .join('\n')
          : ''
    ).trim();

    if (!text) {
      return res.status(502).json({
        error: 'La IA no devolvió texto. Prueba con fotos más nítidas.'
      });
    }

    return res.status(200).json({ text });
  } catch (_) {
    return res.status(502).json({
      error: 'No se ha podido conectar con Mistral.'
    });
  }
};
