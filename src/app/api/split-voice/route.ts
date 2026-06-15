import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const maxDuration = 60;

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY as string);

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { transcript, items, participants, assignments } = body;

    if (!transcript) {
      return NextResponse.json({ error: "Transcript is missing" }, { status: 400 });
    }

    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash",
      generationConfig: {
        temperature: 0.1,
        responseMimeType: "application/json",
      },
    });

    const prompt = `
      Anda adalah asisten AI cerdas untuk aplikasi Split Bill restoran bernama "Snap Patungan".
      Pengguna baru saja memberikan perintah suara (voice command) untuk mengalokasikan menu ke orang-orang.
      
      Perintah suara pengguna (Transcript): "${transcript}"
      
      Daftar Menu saat ini:
      ${JSON.stringify(items, null, 2)}
      
      Daftar Peserta (Participants) saat ini:
      ${JSON.stringify(participants)}
      
      Alokasi saat ini (Assignments):
      ${JSON.stringify(assignments)}
      
      Tugas Anda:
      1. Ekstrak nama orang dari perintah suara. Jika ada nama baru yang belum ada di "Daftar Peserta", tambahkan. (Catatan: perbaiki kapitalisasi nama agar rapi, contoh "budi" jadi "Budi"). Jika pengguna menyebut kata ganti "aku", "saya", atau "gue", anggap nama tersebut sebagai "Saya" atau sesuai konteks nama pemesan pertama.
      2. Pahami siapa memesan apa berdasarkan "Daftar Menu". Cocokkan dengan indeks menu (0, 1, 2, dst).
      3. Jika perintah mengatakan "sisanya dibagi rata" antara beberapa orang, distribusikan sisa kuantitas menu yang belum teralokasi kepada orang-orang tersebut secara adil.
      4. Jika pengguna menyebut porsi "Nasi Goreng 2", pastikan kuantitasnya diatur menjadi 2 untuk orang tersebut pada indeks menu Nasi Goreng.
      5. Kembalikan HANYA JSON valid dengan struktur berikut:
      
      {
        "participants": ["Budi", "Andi", "Siti"],
        "assignments": {
          "0": { "Budi": 1, "Siti": 1 },
          "1": { "Andi": 2 }
        }
      }
      
      Keterangan assignments: Key pertama adalah string indeks menu dari Daftar Menu (misal "0", "1"). Di dalamnya adalah objek { "Nama": Kuantitas }.
      Gabungkan alokasi baru ini dengan "Alokasi saat ini" jika masuk akal, atau timpa jika instruksinya eksplisit merevisi.
    `;

    const result = await model.generateContent(prompt);
    const responseText = result.response.text();

    return NextResponse.json(JSON.parse(responseText));
  } catch (error) {
    console.error("Voice Split Error:", error);
    return NextResponse.json({ error: "Gagal memproses voice command" }, { status: 500 });
  }
}
