/**
 * Calls the Gemini API with the given context and message.
 * @param {string} apiKey - The Gemini API key.
 * @param {string} context - The context to send to the API.
 * @param {string} message - The user's message.
 * @returns {Promise<object>} - The API response.
 */
export async function callGeminiApi(apiKey, context, message, model = 'gemini-2.5-flash') {
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: `Context: ${context}\nUser: ${message}`,
                },
              ],
            },
          ],
        }),
      }
    );

    const data = await response.json();

    if (data.candidates && data.candidates.length > 0) {
      return { reply: data.candidates[0].content.parts[0].text };
    } else if (data.error) {
      return { error: data.error.message };
    } else {
      return { error: "Unknown error from Gemini API." };
    }
  } catch (error) {
    return { error: error.message };
  }
}
