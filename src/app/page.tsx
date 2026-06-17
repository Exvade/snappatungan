"use client";

import { useState, useRef } from "react";
import jsQR from "jsqr";
import QRCode from "react-qr-code";

type ReceiptItem = { name: string; qty: number; price: number };
type ReceiptData = {
  items: ReceiptItem[];
  subtotal: number;
  tax: number;
  service_charge: number;
  total: number;
};

export default function Home() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ReceiptData | null>(null);

  const [participants, setParticipants] = useState<string[]>([]);
  const [newParticipant, setNewParticipant] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [isProcessingVoice, setIsProcessingVoice] = useState(false);
  const [toast, setToast] = useState({ message: "", visible: false });
  const [qrisString, setQrisString] = useState<string | null>(null);
  const [qrisFileName, setQrisFileName] = useState<string | null>(null);
  const [assignments, setAssignments] = useState<
    Record<number, Record<string, number>>
  >({});
  const [finalBills, setFinalBills] = useState<Record<
    string,
    {
      subtotal: number;
      extra: number;
      total: number;
      items: { name: string; qty: number; priceShare: number }[];
    }
  > | null>(null);

  const recognitionRef = useRef<any>(null);
  const transcriptRef = useRef<string>("");
  const toastTimerRef = useRef<NodeJS.Timeout | null>(null);

  const showToast = (message: string) => {
    setToast({ message, visible: true });
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => {
      setToast((prev) => ({ ...prev, visible: false }));
    }, 4000);
  };

  const handleQrisUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setQrisFileName("Sedang membaca QRIS...");

    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.src = objectUrl;

    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        showToast("Gagal memproses gambar QRIS");
        setQrisFileName(null);
        return;
      }
      ctx.drawImage(img, 0, 0, img.width, img.height);
      const imageData = ctx.getImageData(0, 0, img.width, img.height);
      const code = jsQR(imageData.data, imageData.width, imageData.height, {
        inversionAttempts: "dontInvert",
      });

      if (code && code.data) {
        setQrisString(code.data);
        setQrisFileName("✅ " + file.name.substring(0, 15) + "...");
        showToast("QRIS Penagih berhasil disimpan!");
      } else {
        setQrisFileName(null);
        showToast("Gagal membaca QR Code dari gambar tersebut.");
      }
      URL.revokeObjectURL(objectUrl);
    };
    img.onerror = () => {
      showToast("File rusak atau bukan gambar.");
      setQrisFileName(null);
    };
  };

  const generateDynamicQris = (baseQris: string, amount: number): string => {
    if (!baseQris || baseQris.length < 10) return baseQris;

    let qrisDataNo6304 = baseQris.slice(0, -8); // Asumsi QRIS valid berakhiran 6304 + 4 char CRC

    // Parsing TLV secara sederhana
    let parsed: Record<string, string> = {};
    let i = 0;
    while (i < qrisDataNo6304.length) {
      let tag = qrisDataNo6304.substring(i, i + 2);
      let lenStr = qrisDataNo6304.substring(i + 2, i + 4);
      let len = parseInt(lenStr, 10);
      if (isNaN(len)) break; // Safety check
      let val = qrisDataNo6304.substring(i + 4, i + 4 + len);
      parsed[tag] = val;
      i += 4 + len;
    }

    // Ubah statis menjadi dinamis (Tag 01 = 12)
    parsed["01"] = "12";
    // Set Tag 54 (Transaction Amount)
    parsed["54"] = amount.toString();

    // Reconstruct string
    let newQris = "";
    const sortedKeys = Object.keys(parsed).sort();
    for (const tag of sortedKeys) {
      let val = parsed[tag];
      let lenStr = val.length.toString().padStart(2, "0");
      newQris += tag + lenStr + val;
    }

    newQris += "6304";

    // Hitung ulang CRC16 CCITT
    let crc = 0xffff;
    for (let c = 0; c < newQris.length; c++) {
      crc ^= newQris.charCodeAt(c) << 8;
      for (let j = 0; j < 8; j++) {
        if (crc & 0x8000) {
          crc = (crc << 1) ^ 0x1021;
        } else {
          crc = crc << 1;
        }
      }
    }
    const finalCrc = (crc & 0xffff).toString(16).toUpperCase().padStart(4, "0");

    return newQris + finalCrc;
  };

  const toggleVoiceRecognition = () => {
    if (isListening) {
      // User mematikan mic secara manual
      recognitionRef.current?.stop();
      return;
    }

    // @ts-ignore
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      showToast("Browser Anda tidak mendukung fitur Voice-to-Split. Coba gunakan Chrome atau Safari terbaru.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognitionRef.current = recognition;
    transcriptRef.current = ""; // Reset setiap kali mulai baru

    recognition.lang = "id-ID";
    recognition.continuous = true; // Tidak akan mati saat ada jeda napas
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    let finalTranscript = "";

    recognition.onstart = () => {
      setIsListening(true);
    };

    recognition.onresult = (event: any) => {
      let currentInterim = "";
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript + " ";
        } else {
          currentInterim += event.results[i][0].transcript;
        }
      }
      // Gabungkan hasil akhir dan hasil sementara
      transcriptRef.current = finalTranscript + currentInterim;
    };

    recognition.onerror = (event: any) => {
      console.error("Speech recognition error", event.error);
      setIsListening(false);
      showToast("Gagal mendeteksi suara: " + event.error);
    };

    recognition.onend = async () => {
      setIsListening(false);
      
      const fullTranscript = transcriptRef.current.trim();
      if (!fullTranscript) return;

      setIsProcessingVoice(true);

      try {
        const response = await fetch("/api/split-voice", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            transcript: fullTranscript,
            items: result?.items,
            participants,
            assignments,
          }),
        });

        if (!response.ok) {
          throw new Error("Gagal memproses voice split");
        }

        const data = await response.json();
        
        if (data.participants) {
          setParticipants((prev) => Array.from(new Set([...prev, ...data.participants])));
        }

        if (data.assignments) {
          setAssignments((prev) => {
            const merged = { ...prev };
            Object.keys(data.assignments).forEach((idxStr) => {
              const idx = parseInt(idxStr, 10);
              merged[idx] = { ...(merged[idx] || {}), ...data.assignments[idxStr] };
            });
            return merged;
          });
        }
      } catch (error) {
        console.error("Voice Split Error:", error);
        showToast("Gagal memproses suara. Coba lagi.");
      } finally {
        setIsProcessingVoice(false);
      }
    };

    recognition.start();
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];

    // Reset nilai input agar bisa dipakai berulang kali tanpa error
    e.target.value = "";

    if (!file) {
      showToast("Gagal membaca file dari kamera/galeri.");
      return;
    }

    // Ubah UI menjadi status loading SEGERA setelah foto diambil
    setLoading(true);
    setResult(null);
    setParticipants([]);
    setAssignments({});
    setFinalBills(null);

    try {
      const img = new Image();
      // Gunakan URL sementara untuk file gambar
      const objectUrl = URL.createObjectURL(file);
      img.src = objectUrl;

      img.onload = async () => {
        try {
          const canvas = document.createElement("canvas");
          const MAX_WIDTH = 800; // Kompresi ukuran
          let width = img.width;
          let height = img.height;

          if (width > MAX_WIDTH) {
            height = Math.round((height * MAX_WIDTH) / width);
            width = MAX_WIDTH;
          }

          canvas.width = width;
          canvas.height = height;

          const ctx = canvas.getContext("2d");
          ctx?.drawImage(img, 0, 0, width, height);

          // Konversi ke base64 (Kualitas 70% agar ringan dikirim via WiFi lokal)
          const base64String = canvas
            .toDataURL("image/jpeg", 0.7)
            .split(",")[1];

          // Bersihkan memory browser HP
          URL.revokeObjectURL(objectUrl);

          const response = await fetch("/api/extract", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ imageBase64: base64String }),
          });

          if (!response.ok) {
            throw new Error(`Server error: ${response.status}`);
          }

          const data = await response.json();
          setResult(data);
        } catch (error) {
          console.error("Error Processing:", error);
          showToast("Gagal memproses gambar. Pastikan koneksi WiFi stabil.");
        } finally {
          setLoading(false);
        }
      };

      img.onerror = () => {
        showToast("File yang dimasukkan bukan gambar yang valid atau rusak.");
        setLoading(false);
      };
    } catch (error) {
      showToast("Browser gagal memuat kamera/gambar.");
      setLoading(false);
    }
  };

  const addParticipant = () => {
    if (newParticipant.trim() && !participants.includes(newParticipant)) {
      setParticipants([...participants, newParticipant.trim()]);
      setNewParticipant("");
    }
  };

  const removeParticipant = (nameToRemove: string) => {
    setParticipants((prev) => prev.filter((p) => p !== nameToRemove));
    
    // Hapus juga assignment orang tersebut di semua menu
    setAssignments((prev) => {
      const updated = { ...prev };
      Object.keys(updated).forEach((idxStr) => {
        const idx = parseInt(idxStr, 10);
        if (updated[idx] && updated[idx][nameToRemove]) {
          delete updated[idx][nameToRemove];
        }
      });
      return updated;
    });
  };

  const toggleAssignment = (itemIndex: number, person: string) => {
    setAssignments((prev) => {
      const itemAssignments = { ...(prev[itemIndex] || {}) };
      if (itemAssignments[person]) {
        delete itemAssignments[person];
      } else {
        itemAssignments[person] = 1;
      }
      return { ...prev, [itemIndex]: itemAssignments };
    });
  };

  const updatePortion = (itemIndex: number, person: string, delta: number) => {
    setAssignments((prev) => {
      const itemAssignments = { ...(prev[itemIndex] || {}) };
      const currentQty = itemAssignments[person] || 0;
      const newQty = currentQty + delta;

      if (newQty <= 0) {
        delete itemAssignments[person];
      } else {
        itemAssignments[person] = newQty;
      }
      return { ...prev, [itemIndex]: itemAssignments };
    });
  };

  const calculateSplit = () => {
    if (!result) return;

    const bills: Record<
      string,
      {
        subtotal: number;
        extra: number;
        total: number;
        items: { name: string; qty: number; priceShare: number }[];
      }
    > = {};

    participants.forEach((p) => {
      bills[p] = { subtotal: 0, extra: 0, total: 0, items: [] };
    });

    result.items.forEach((item, index) => {
      const itemAssigns = assignments[index] || {};
      const assignedPeople = Object.keys(itemAssigns);

      if (assignedPeople.length > 0) {
        const totalPortions = Object.values(itemAssigns).reduce(
          (a, b) => a + b,
          0
        );
        assignedPeople.forEach((person) => {
          const portions = itemAssigns[person];
          const priceShare = (portions / totalPortions) * item.price;
          if (bills[person]) {
            bills[person].subtotal += priceShare;
            bills[person].items.push({
              name: item.name,
              qty: portions,
              priceShare: priceShare,
            });
          }
        });
      }
    });

    const totalExtra = (result.tax || 0) + (result.service_charge || 0);
    const validSubtotal = result.subtotal || 1;

    participants.forEach((person) => {
      const ratio = bills[person].subtotal / validSubtotal;
      const personExtra = ratio * totalExtra;

      bills[person].extra = personExtra;
      bills[person].total = bills[person].subtotal + personExtra;
    });

    setFinalBills(bills);
  };

  const isReadyToCalculate =
    result?.items && Array.isArray(result.items)
      ? result.items.every((item, index) => {
          const itemAssigns = assignments[index] || {};
          const totalPortions = Object.values(itemAssigns).reduce(
            (a, b) => a + b,
            0
          );
          if (item.qty > 1) {
            return totalPortions === item.qty;
          } else {
            return totalPortions > 0;
          }
        })
      : false;

  return (
    <main className="min-h-screen p-4 sm:p-8 bg-zinc-200 text-zinc-800 font-mono pb-24 flex flex-col items-center">
      {/* Custom Styles untuk Efek Kertas Struk */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
        .receipt-bottom {
          background-image: radial-gradient(circle at 10px 0, transparent 10px, #fafafa 11px);
          background-size: 20px 20px;
          background-position: top center;
          height: 20px;
          width: 100%;
          transform: rotate(180deg);
        }
        @keyframes print {
          0% { transform: translateY(-100%); opacity: 0; }
          100% { transform: translateY(0); opacity: 1; }
        }
        .animate-print {
          animation: print 2s ease-out forwards;
        }
      `,
        }}
      />

      <div className="w-full max-w-md space-y-6">
        {/* HEADER / LOGO */}
        <div className="text-center space-y-1 mb-6">
          <h1 className="text-2xl font-bold tracking-widest uppercase border-b-2 border-zinc-800 inline-block pb-1">
            SNAP_PATUNGAN
          </h1>
          <p className="text-xs text-zinc-500 uppercase tracking-widest mt-2">
            Point of Sale System
          </p>
        </div>

        {/* SETTING QRIS (OPSIONAL) */}
        {!result && (
          <div className="bg-zinc-100 p-4 border-2 border-dashed border-zinc-400 mb-6 text-center shadow-inner">
            <p className="text-xs font-bold uppercase tracking-wider text-zinc-600 mb-3">
              &gt;&gt; UPLOAD QRIS PENAGIH (OPSIONAL)
            </p>
            <label className="inline-block bg-yellow-400 text-zinc-900 border-2 border-zinc-800 px-4 py-2 text-xs font-bold uppercase tracking-widest cursor-pointer shadow-[2px_2px_0px_#27272a] hover:translate-y-[1px] hover:translate-x-[1px] hover:shadow-[1px_1px_0px_#27272a] active:shadow-none active:translate-x-[2px] active:translate-y-[2px] transition-all">
              {qrisFileName ? qrisFileName : "PILIH GAMBAR QRIS"}
              <input type="file" accept="image/*" onChange={handleQrisUpload} className="hidden" />
            </label>
            <p className="text-[10px] text-zinc-500 mt-2">Agar teman bisa langsung scan saat bayar</p>
          </div>
        )}

        {/* SECTION 1: UPLOAD & LOADING */}
        {!result && (
          <div className="bg-zinc-50 p-6 shadow-md rounded-sm border border-zinc-300 relative overflow-hidden">
            {!loading ? (
              <div className="space-y-5">
                <div className="text-center border-b border-dashed border-zinc-300 pb-4">
                  <p className="text-sm font-bold uppercase tracking-wider text-zinc-600">
                    &gt;&gt; SELECT INPUT METHOD
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {/* TOMBOL KAMERA */}
                  <label className="flex flex-col items-center justify-center h-32 border-2 border-zinc-800 bg-zinc-200 hover:bg-zinc-300 cursor-pointer transition-all shadow-[4px_4px_0px_#27272a] active:shadow-none active:translate-x-[4px] active:translate-y-[4px]">
                    <svg
                      className="w-8 h-8 text-zinc-800 mb-2"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="square"
                        strokeLinejoin="miter"
                        d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
                      ></path>
                      <circle
                        cx="12"
                        cy="13"
                        r="3"
                        stroke="currentColor"
                        strokeWidth="1.5"
                      ></circle>
                    </svg>
                    <p className="text-xs font-bold uppercase tracking-widest text-zinc-900">
                      CAMERA
                    </p>
                    {/* Trik Utama: capture="environment" untuk buka kamera belakang */}
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                  </label>

                  {/* TOMBOL GALERI */}
                  <label className="flex flex-col items-center justify-center h-32 border-2 border-dashed border-zinc-400 hover:border-zinc-800 hover:bg-zinc-100 cursor-pointer transition-colors">
                    <svg
                      className="w-8 h-8 text-zinc-500 mb-2"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="square"
                        strokeLinejoin="miter"
                        d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                      ></path>
                    </svg>
                    <p className="text-xs font-bold uppercase tracking-widest text-zinc-600">
                      GALLERY
                    </p>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                  </label>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-10 space-y-4">
                <div className="w-20 h-24 border border-zinc-300 bg-white shadow-inner flex flex-col items-center p-2 overflow-hidden relative">
                  <div className="w-full h-full bg-zinc-100 absolute top-0 flex flex-col gap-1 p-2 animate-print">
                    <div className="w-full h-1 bg-zinc-300"></div>
                    <div className="w-3/4 h-1 bg-zinc-300"></div>
                    <div className="w-full h-1 bg-zinc-300"></div>
                    <div className="w-1/2 h-1 bg-zinc-300"></div>
                  </div>
                </div>
                <p className="text-xs uppercase tracking-widest text-zinc-500 animate-pulse">
                  PROCESSING DATA...
                </p>
              </div>
            )}
          </div>
        )}

        {/* BUNGKUSAN KERTAS STRUK (SECTION 2 & 3) */}
        {result && (
          <div className="shadow-lg relative">
            <div className="bg-[#fafafa] p-6 sm:p-8 border border-zinc-200">
              {/* Kepala Struk */}
              <div className="text-center border-b-2 border-dashed border-zinc-300 pb-6 mb-6">
                <h2 className="text-xl font-bold uppercase tracking-wider">
                  RESTO SNAP
                </h2>
                <p className="text-xs text-zinc-500 mt-1 uppercase">
                  Tgl: {new Date().toLocaleDateString("id-ID")} | Kasir: AI
                </p>
                <p className="text-xs text-zinc-500 uppercase">
                  ------------------------
                </p>
              </div>

              {/* SECTION 2: INTERACTIVE SPLIT */}
              {!finalBills && (
                <div className="space-y-8">
                  {/* AI Voice Command */}
                  <div className="bg-zinc-100 p-4 border border-dashed border-zinc-400 text-center space-y-3">
                    <p className="text-xs font-bold uppercase text-zinc-600 tracking-widest">
                      AI VOICE SPLIT &lt;&lt;
                    </p>
                    <button
                      onClick={toggleVoiceRecognition}
                      disabled={isProcessingVoice && !isListening}
                      className={`w-full py-3 flex items-center justify-center gap-2 text-sm font-bold uppercase transition-all shadow-[2px_2px_0px_#27272a] active:shadow-none active:translate-x-[2px] active:translate-y-[2px] border-2 border-zinc-800
                        ${isListening ? "bg-red-500 text-white border-red-800 shadow-[2px_2px_0px_#7f1d1d] animate-pulse" : 
                          isProcessingVoice ? "bg-yellow-400 text-zinc-900 cursor-wait" : 
                          "bg-white hover:bg-zinc-200 text-zinc-900"}`}
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"></path>
                      </svg>
                      {isListening ? "TAP UNTUK SELESAI" : isProcessingVoice ? "MEMPROSES AI..." : "TAP TO SPEAK"}
                    </button>
                    <p className="text-[10px] text-zinc-500">
                      Coba: "Budi nasi goreng, sisanya bagi rata"
                    </p>
                  </div>

                  {/* Input Partisipan */}
                  <div>
                    <h3 className="text-sm font-bold uppercase mb-3 text-zinc-600">
                      {" "}
                      1. INPUT CUSTOMER
                    </h3>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={newParticipant}
                        onChange={(e) => setNewParticipant(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && addParticipant()}
                        placeholder="NAMA..."
                        className="flex-1 bg-transparent border-b-2 border-zinc-300 p-2 text-sm uppercase outline-none focus:border-zinc-800 transition-colors"
                      />
                      <button
                        onClick={addParticipant}
                        className="bg-zinc-800 text-white px-4 py-2 text-xs font-bold uppercase rounded-sm hover:bg-zinc-700 active:scale-95 transition-all"
                      >
                        ADD
                      </button>
                    </div>

                    {participants.length > 0 && (
                      <div className="flex flex-wrap gap-2 mt-4">
                        {participants.map((p) => (
                          <span
                            key={p}
                            className="bg-zinc-200 text-zinc-800 pl-3 pr-2 py-1 text-xs font-bold uppercase rounded-sm flex items-center gap-2 group"
                          >
                            {p}
                            <button
                              onClick={() => removeParticipant(p)}
                              className="text-zinc-400 hover:text-red-600 focus:outline-none transition-colors"
                              title="Hapus"
                            >
                              ✕
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Assign Menu */}
                  <div className="pt-4 border-t-2 border-dashed border-zinc-300">
                    <h3 className="text-sm font-bold uppercase mb-4 text-zinc-600">
                      {" "}
                      2. ORDER LIST
                    </h3>

                      <div className="space-y-6">
                        {result.items?.map((item, index) => {
                          const itemAssigns = assignments[index] || {};
                          const hasAssignees =
                            Object.keys(itemAssigns).length > 0;
                          const currentTotal = Object.values(
                            itemAssigns
                          ).reduce((a, b) => a + b, 0);
                          const isUnbalanced =
                            item.qty > 1 && currentTotal !== item.qty;

                          return (
                            <div key={index} className="flex flex-col gap-2">
                              <div className="flex justify-between items-start">
                                <span className="font-bold text-sm uppercase">
                                  {item.qty}x {item.name}
                                </span>
                                <span className="text-sm">
                                  {item.price.toLocaleString("id-ID")}
                                </span>
                              </div>

                              {/* Error Label ala cap stempel */}
                              {isUnbalanced && hasAssignees && (
                                <span className="text-[10px] bg-red-100 text-red-600 font-bold px-2 py-0.5 w-fit uppercase border border-red-300">
                                  ! QTY INVALID ({currentTotal}/{item.qty})
                                </span>
                              )}

                              <div className="flex flex-col gap-2 mt-1">
                                <div className="flex flex-wrap gap-2">
                                  {participants.map((person) => {
                                    const isSelected = !!itemAssigns[person];
                                    return (
                                      <button
                                        key={person}
                                        onClick={() =>
                                          toggleAssignment(index, person)
                                        }
                                        className={`px-3 py-1 text-xs font-bold uppercase border border-zinc-300 transition-all
                                          ${
                                            isSelected
                                              ? "bg-yellow-200 text-zinc-900 border-yellow-400 shadow-[2px_2px_0px_#eab308]"
                                              : "bg-transparent text-zinc-500 hover:bg-zinc-100"
                                          }`}
                                      >
                                        {person}
                                      </button>
                                    );
                                  })}
                                </div>

                                {hasAssignees && (
                                  <div className="bg-zinc-100 p-2 mt-1 border border-zinc-200">
                                    <p className="text-[10px] font-bold text-zinc-500 mb-2 uppercase tracking-wider">
                                      SHARE RATIO:
                                    </p>
                                    <div className="space-y-1">
                                      {Object.entries(itemAssigns).map(
                                        ([person, qty]) => (
                                          <div
                                            key={person}
                                            className="flex justify-between items-center px-1"
                                          >
                                            <span className="text-xs font-bold uppercase">
                                              - {person}
                                            </span>
                                            <div className="flex items-center gap-2">
                                              <button
                                                onClick={() =>
                                                  updatePortion(
                                                    index,
                                                    person,
                                                    -1
                                                  )
                                                }
                                                className="w-5 h-5 bg-zinc-300 flex items-center justify-center text-xs font-bold hover:bg-zinc-400"
                                              >
                                                -
                                              </button>
                                              <span className="text-xs font-bold w-4 text-center">
                                                {qty}
                                              </span>
                                              <button
                                                onClick={() =>
                                                  updatePortion(
                                                    index,
                                                    person,
                                                    1
                                                  )
                                                }
                                                className="w-5 h-5 bg-zinc-800 text-white flex items-center justify-center text-xs font-bold hover:bg-zinc-700"
                                              >
                                                +
                                              </button>
                                            </div>
                                          </div>
                                        )
                                      )}
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {/* Tombol Hitung ala Mesin Kasir */}
                      <div className="mt-8 pt-6 border-t-2 border-dashed border-zinc-300 space-y-3">
                        {!isReadyToCalculate && (
                          <div className="bg-red-50 p-2 text-center border border-red-200">
                            <p className="text-[11px] font-bold text-red-600 uppercase">
                              ERROR: ALOKASI QTY BELUM SESUAI
                            </p>
                          </div>
                        )}
                        <button
                          onClick={calculateSplit}
                          disabled={!isReadyToCalculate}
                          className={`w-full py-4 text-sm font-bold uppercase tracking-widest transition-all rounded-sm
                            ${
                              isReadyToCalculate
                                ? "bg-zinc-900 text-white shadow-[0_4px_0px_#3f3f46] active:shadow-none active:translate-y-[4px]"
                                : "bg-zinc-300 text-zinc-500 cursor-not-allowed"
                            }`}
                        >
                          [ PRINT INVOICE ]
                        </button>
                      </div>
                    </div>
                </div>
              )}

              {/* SECTION 3: FINAL RESULT (Tampilan Akhir Struk) */}
              {finalBills && (
                <div className="space-y-6 animate-print">
                  <div className="text-center mb-6">
                    <p className="text-sm font-bold uppercase tracking-wider">
                      SPLIT RESULT &lt;&lt;
                    </p>
                  </div>

                  <div className="space-y-6">
                    {Object.entries(finalBills).map(([person, bill]) => (
                      <div
                        key={person}
                        className="border-b border-zinc-300 pb-4 last:border-0"
                      >
                        <h3 className="font-bold text-base uppercase mb-2 bg-yellow-200 inline-block px-1">
                          {person}
                        </h3>

                        {/* MENU ITEMS ORDERED */}
                        {bill.items.length > 0 && (
                          <div className="mb-3 space-y-1">
                            {bill.items.map((item, idx) => (
                              <div key={idx} className="flex justify-between text-xs text-zinc-700">
                                <span className="uppercase">
                                  {item.qty}x {item.name}
                                </span>
                                <span>{Math.round(item.priceShare).toLocaleString("id-ID")}</span>
                              </div>
                            ))}
                          </div>
                        )}

                        <div className="space-y-1 text-xs pt-2 border-t border-dashed border-zinc-300">
                          <div className="flex justify-between">
                            <span className="text-zinc-600">SUBTOTAL</span>
                            <span>
                              {Math.round(bill.subtotal).toLocaleString(
                                "id-ID"
                              )}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-zinc-600">TAX & SVC</span>
                            <span>
                              {Math.round(bill.extra).toLocaleString("id-ID")}
                            </span>
                          </div>
                          <div className="flex justify-between font-bold text-sm pt-2 mt-1 border-t border-dashed border-zinc-400">
                            <span>TOTAL DUE</span>
                            <span>
                              Rp{" "}
                              {Math.round(bill.total).toLocaleString("id-ID")}
                            </span>
                          </div>
                        </div>

                        {/* RENDER DYNAMIC QRIS IF AVAILABLE */}
                        {qrisString && Math.round(bill.total) > 0 && (
                          <div className="mt-4 flex flex-col items-center p-3 bg-white border-2 border-zinc-800 shadow-[2px_2px_0px_#27272a]">
                            <p className="text-[10px] font-bold uppercase tracking-widest mb-2 text-zinc-600">
                              SCAN TO PAY (Rp {Math.round(bill.total).toLocaleString("id-ID")})
                            </p>
                            <div className="p-1 border border-zinc-300">
                              <QRCode
                                value={generateDynamicQris(qrisString, Math.round(bill.total))}
                                size={120}
                                level="M"
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  <div className="text-center pt-8 space-y-1">
                    <p className="text-xs uppercase font-bold">TERIMA KASIH</p>
                    <p className="text-[10px] text-zinc-500">
                      POWERED BY GEMINI 2.5 FLASH
                    </p>
                  </div>

                  <button
                    onClick={() => {
                      setResult(null);
                      setFinalBills(null);
                    }}
                    className="w-full mt-6 bg-transparent border-2 border-zinc-800 text-zinc-800 font-bold py-3 text-xs uppercase hover:bg-zinc-100 transition-colors"
                  >
                    SCAN STRUK BARU
                  </button>
                </div>
              )}
            </div>
            {/* Bagian Bawah Kertas Struk (Zigzag) */}
            <div className="receipt-bottom"></div>
          </div>
        )}
      </div>

      {/* TOAST POPUP */}
      <div
        className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 transition-all duration-300 ${
          toast.visible
            ? "opacity-100 translate-y-0"
            : "opacity-0 translate-y-4 pointer-events-none"
        }`}
      >
        <div className="bg-zinc-900 text-white px-4 py-3 shadow-[4px_4px_0px_#facc15] border-2 border-zinc-800 flex items-center gap-3 w-max max-w-[90vw]">
          <svg
            className="w-5 h-5 text-yellow-400 shrink-0"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            ></path>
          </svg>
          <p className="text-xs uppercase font-bold tracking-wider">
            {toast.message}
          </p>
          <button
            onClick={() => setToast({ ...toast, visible: false })}
            className="ml-2 text-zinc-400 hover:text-white transition-colors"
          >
            ✕
          </button>
        </div>
      </div>
    </main>
  );
}
