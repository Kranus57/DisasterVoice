import { GoogleGenAI } from '@google/genai';

// Initialize the GenAI SDK if key is provided
let ai = null;
if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim() !== "") {
  try {
    ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  } catch (error) {
    console.error("Failed to initialize Google GenAI SDK:", error);
  }
}

// Offline high-fidelity mock translation library for various languages to guarantee demo runs perfectly
const mockTranslations = {
  Hindi: {
    threat: "चक्रवात चेतावनी - तटीय ओडिशा में चक्रवात डाना का आगमन हो रहा है, जिसकी हवा की गति 120-150 किमी/घंटा है।",
    timing: "अगले 24 घंटों में लैंडफॉल की संभावना है, मुख्य रूप से 25 अक्टूबर को 18:00 बजे आईएसटी।",
    action: [
      "कच्चे और असुरक्षित घरों को तुरंत खाली करें।",
      "निकटतम निर्दिष्ट चक्रवात आश्रय (Cyclone Shelter) में चले जाएं।",
      "सूखा भोजन, पीने का पानी और आपातकालीन दवाएं साथ रखें।"
    ]
  },
  Bengali: {
    threat: "ঘূর্ণিঝড় সতর্কতা - উপকূলীয় ওড়িশায় ঘূর্ণিঝড় ডানা আছড়ে পড়তে চলেছে, বাতাসের গতিবেগ ১২০-১৫০ কিমি/ঘণ্টা।",
    timing: "আগামী ২৪ ঘণ্টার মধ্যে ল্যান্ডফল হওয়ার সম্ভাবনা রয়েছে, মূলত ২৫ অক্টোবর সন্ধ্যা ১৮:০০ টার দিকে।",
    action: [
      "কাঁচা ও ঝুঁকিপূর্ণ বাড়িগুলি অবিলম্বে খালি করুন।",
      "নিকটবর্তী ঘূর্ণিঝড় আশ্রয় কেন্দ্রে চলে যান।",
      "শুকনো খাবার, পানীয় জল এবং জরুরি ওষুধ প্রস্তুত রাখুন।"
    ]
  },
  Tamil: {
    threat: "புயல் எச்சரிக்கை - கடலோர ஒடிசாவை நோக்கி மணிக்கு 120-150 கிமீ வேகத்தில் டானா புயல் நகர்ந்து வருகிறது.",
    timing: "அடுத்த 24 மணி நேரத்திற்குள், அக்டோபர் 25 மாலை 18:00 மணியளவில் கரையைக் கடக்கும் என எதிர்பார்க்கப்படுகிறது.",
    action: [
      "பலவீனமான கட்டிடங்களில் இருப்பவர்கள் உடனடியாக வெளியேறவும்.",
      "அருகிலுள்ள நியமிக்கப்பட்ட புயல் நிவாரண முகாம்களுக்குச் செல்லவும்.",
      "உலர்ந்த உணவு, குடிநீர் மற்றும் முதலுதவிப் பெட்டிகளை தயார் நிலையில் வைக்கவும்."
    ]
  }
};

/**
 * Translates and structures a raw text alert into the target language.
 * Uses Gemini if configured, otherwise falls back to static high-fidelity mocks.
 * 
 * @param {string} alertText - Raw emergency announcement
 * @param {string} language - Target language (Hindi, Tamil, Bengali)
 * @returns {Promise<{threat: string, timing: string, action: string[]}>}
 */
export async function translateAlert(alertText, language) {
  const languageName = language.charAt(0).toUpperCase() + language.slice(1).toLowerCase();

  if (!ai) {
    console.log(`[Agent B - Translator] Running in Simulation Mock Mode for language: ${languageName}`);
    // Simulate slight network delay of 800ms
    await new Promise(resolve => setTimeout(resolve, 800));
    return mockTranslations[languageName] || {
      threat: `[Simulated Alert] ${alertText}`,
      timing: "Immediate action required.",
      action: ["Stay indoors.", "Follow local authorities directives.", "Keep communications open."]
    };
  }

  const systemInstruction = `
You are a Multilingual Crisis Communication Agent.
Your task is to translate and structure emergency alerts into the target language: ${languageName}.
You must analyze the raw disaster alert and output a strict JSON object with EXACTLY three fields:
1. "threat": A short, clear description of the specific hazard/disaster translated into the target language. Include intensity/severity.
2. "timing": The timeline/when the impact is expected, translated into the target language.
3. "action": An array of strings containing short, immediate, actionable, and bulleted lifesaving instructions in the target language.

Rules:
- Do NOT include any introductory or concluding remarks, conversational filler, or explanations.
- Output ONLY the raw valid JSON. Do not wrap it in markdown codeblocks (e.g. \`\`\`json).
- Maintain an authoritative, urgent, and calm tone.
`;

  const prompt = `Translate and structure this emergency feed: "${alertText}"`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        systemInstruction: systemInstruction,
        responseMimeType: 'application/json'
      }
    });

    const textOutput = response.text.trim();
    console.log(`[Agent B - Translator] Raw LLM Response for ${languageName}:`, textOutput);
    
    // Parse response
    const parsedData = JSON.parse(textOutput);
    
    // Validate schema
    if (!parsedData.threat || !parsedData.timing || !Array.isArray(parsedData.action)) {
      throw new Error("Invalid output format from LLM");
    }

    return parsedData;
  } catch (error) {
    console.error(`[Agent B - Translator] Error using LLM for ${languageName}, falling back to mock:`, error);
    return mockTranslations[languageName] || {
      threat: `[Translation Fallback] ${alertText}`,
      timing: "Immediate",
      action: ["Stay alert.", "Follow local broadcasts."]
    };
  }
}
