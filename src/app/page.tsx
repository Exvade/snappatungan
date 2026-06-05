"use client";

import { useState } from "react";

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

  // PERUBAHAN 1: State sekarang menyimpan jumlah porsi tiap orang per item
  // Contoh: { 0: { "Deft": 2, "Budi": 1 } } -> Item index 0, Deft ambil 2, Budi ambil 1
  const [assignments, setAssignments] = useState<
    Record<number, Record<string, number>>
  >({});

  const [finalBills, setFinalBills] = useState<Record<
    string,
    { subtotal: number; extra: number; total: number }
  > | null>(null);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setResult(null);
    setParticipants([]);
    setAssignments({});
    setFinalBills(null);

    const img = new Image();
    img.src = URL.createObjectURL(file);
    img.onload = async () => {
      const canvas = document.createElement("canvas");
      const MAX_WIDTH = 800;
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
      const base64String = canvas.toDataURL("image/jpeg", 0.7).split(",")[1];

      try {
        const response = await fetch("/api/extract", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imageBase64: base64String }),
        });
        const data = await response.json();
        setResult(data);
      } catch (error) {
        console.error("Error:", error);
        alert("Gagal mengekstrak struk");
      } finally {
        setLoading(false);
      }
    };
  };

  const addParticipant = () => {
    if (newParticipant.trim() && !participants.includes(newParticipant)) {
      setParticipants([...participants, newParticipant.trim()]);
      setNewParticipant("");
    }
  };

  const toggleAssignment = (itemIndex: number, person: string) => {
    setAssignments((prev) => {
      const itemAssignments = { ...(prev[itemIndex] || {}) };

      if (itemAssignments[person]) {
        delete itemAssignments[person];
      } else {
        itemAssignments[person] = 1; // Default bobot awal = 1
      }
      return { ...prev, [itemIndex]: itemAssignments };
    });
  };

  const updatePortion = (itemIndex: number, person: string, delta: number) => {
    setAssignments((prev) => {
      const itemAssignments = { ...(prev[itemIndex] || {}) };
      const currentQty = itemAssignments[person] || 0;
      const newQty = currentQty + delta;

      // Pembatasan dihapus sepenuhnya. Bebas berapapun!
      if (newQty <= 0) {
        delete itemAssignments[person];
      } else {
        itemAssignments[person] = newQty;
      }
      return { ...prev, [itemIndex]: itemAssignments };
    });
  };

  // PERUBAHAN 4: Kalkulasi berdasarkan rasio porsi
  const calculateSplit = () => {
    if (!result) return;

    const bills: Record<
      string,
      { subtotal: number; extra: number; total: number }
    > = {};
    participants.forEach((p) => {
      bills[p] = { subtotal: 0, extra: 0, total: 0 };
    });

    result.items.forEach((item, index) => {
      const itemAssigns = assignments[index] || {};
      const assignedPeople = Object.keys(itemAssigns);

      if (assignedPeople.length > 0) {
        // Hitung total porsi untuk item ini
        const totalPortions = Object.values(itemAssigns).reduce(
          (a, b) => a + b,
          0
        );

        assignedPeople.forEach((person) => {
          const portions = itemAssigns[person];
          // Harga dibagi berdasarkan rasio porsi yang diambil
          const priceShare = (portions / totalPortions) * item.price;
          if (bills[person]) bills[person].subtotal += priceShare;
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

  return (
    <main className="min-h-screen p-4 sm:p-8 bg-[#F5D6BA] text-[#2C2C54] font-sans pb-24 selection:bg-[#F49D6E] selection:text-[#2C2C54]">
      <div className="max-w-md mx-auto space-y-6 sm:space-y-8">
        <div className="text-center space-y-2 mt-4 sm:mt-8">
          <h1 className="text-4xl font-extrabold tracking-tight text-[#A40E4C]">
            SnapPatungan
          </h1>
          <p className="text-[#2C2C54]/70 font-medium">
            Bagi tagihan tanpa pusing.
          </p>
        </div>

        {/* SECTION 1: UPLOAD (Tetap Sama) */}
        {!result && (
          <div className="bg-white/80 backdrop-blur-sm p-6 sm:p-8 rounded-3xl shadow-xl border border-white">
            <div className="space-y-4">
              <label className="flex flex-col items-center justify-center w-full h-40 border-2 border-dashed border-[#ACC3A6] rounded-2xl cursor-pointer bg-white hover:bg-[#F5D6BA]/20 transition-all">
                <div className="flex flex-col items-center justify-center pt-5 pb-6">
                  <div className="bg-[#F49D6E]/20 p-3 rounded-full mb-3">
                    <svg
                      className="w-8 h-8 text-[#F49D6E]"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
                      ></path>
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"
                      ></path>
                    </svg>
                  </div>
                  <p className="mb-2 text-sm font-semibold text-[#2C2C54]">
                    Tap untuk Foto Struk
                  </p>
                </div>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </label>
              {loading && (
                <p className="text-center text-[#A40E4C] font-semibold animate-pulse mt-4">
                  Mengekstrak data...
                </p>
              )}
            </div>
          </div>
        )}

        {/* SECTION 2: INTERACTIVE SPLIT */}
        {result && !finalBills && (
          <div className="space-y-6">
            {/* Input Partisipan (Tetap Sama) */}
            <div className="bg-white p-6 rounded-3xl shadow-lg border border-white">
              <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
                <span className="bg-[#2C2C54] text-white w-6 h-6 flex items-center justify-center rounded-full text-sm">
                  1
                </span>
                Siapa yang ikut?
              </h2>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newParticipant}
                  onChange={(e) => setNewParticipant(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addParticipant()}
                  placeholder="Ketik nama..."
                  className="flex-1 border-2 border-[#ACC3A6]/30 bg-gray-50 p-3 rounded-xl outline-none"
                />
                <button
                  onClick={addParticipant}
                  className="bg-[#2C2C54] text-white px-5 py-3 rounded-xl font-bold"
                >
                  +
                </button>
              </div>
              {participants.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-[#ACC3A6]/20">
                  {participants.map((p) => (
                    <span
                      key={p}
                      className="bg-[#F5D6BA] text-[#A40E4C] px-4 py-1.5 rounded-full text-sm font-bold shadow-sm"
                    >
                      {p}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* PERUBAHAN 5: UI Assign Menu dengan Counter */}
            {participants.length > 0 && (
              <div className="bg-white p-6 rounded-3xl shadow-lg border border-white">
                <h2 className="text-lg font-bold mb-6 flex items-center gap-2">
                  <span className="bg-[#2C2C54] text-white w-6 h-6 flex items-center justify-center rounded-full text-sm">
                    2
                  </span>
                  Siapa makan apa?
                </h2>
                <div className="space-y-6">
                  {result.items.map((item, index) => {
                    const itemAssigns = assignments[index] || {};
                    const hasAssignees = Object.keys(itemAssigns).length > 0;

                    return (
                      <div
                        key={index}
                        className="border-b border-[#ACC3A6]/20 pb-6 last:border-0 last:pb-0"
                      >
                        <div className="flex justify-between items-start mb-3">
                          <span className="font-bold text-[#2C2C54] pr-4">
                            {item.name}{" "}
                            <span className="text-[#A40E4C] text-sm">
                              (x{item.qty})
                            </span>
                          </span>
                          <span className="text-[#2C2C54]/70 font-semibold whitespace-nowrap">
                            Rp {item.price.toLocaleString("id-ID")}
                          </span>
                        </div>

                        <div className="flex flex-col gap-3">
                          {/* Pil Nama */}
                          <div className="flex flex-wrap gap-2">
                            {participants.map((person) => {
                              const isSelected = !!itemAssigns[person];
                              return (
                                <button
                                  key={person}
                                  onClick={() =>
                                    toggleAssignment(index, person)
                                  }
                                  className={`px-4 py-1.5 rounded-full text-sm font-bold transition-all border-2 
                                    ${
                                      isSelected
                                        ? "bg-[#F49D6E] text-[#2C2C54] border-[#F49D6E] shadow-md"
                                        : "bg-transparent text-[#2C2C54]/60 border-[#ACC3A6]/40 hover:border-[#ACC3A6]"
                                    }`}
                                >
                                  {person}
                                </button>
                              );
                            })}
                          </div>

                          {/* Sub-menu Counter muncul HANYA untuk orang yang terpilih */}
                          {hasAssignees && (
                            <div className="bg-[#F5D6BA]/30 p-3 rounded-xl mt-1 space-y-2 border border-[#F5D6BA]">
                              <p className="text-xs font-semibold text-[#2C2C54]/60 mb-2">
                                Atur Rasio/Bobot Patungan:
                              </p>
                              {Object.entries(itemAssigns).map(
                                ([person, qty]) => (
                                  <div
                                    key={person}
                                    className="flex justify-between items-center bg-white px-3 py-2 rounded-lg shadow-sm"
                                  >
                                    <span className="text-sm font-bold text-[#2C2C54]">
                                      {person}
                                    </span>
                                    <div className="flex items-center gap-3">
                                      <button
                                        onClick={() =>
                                          updatePortion(index, person, -1)
                                        }
                                        className="w-7 h-7 bg-gray-100 hover:bg-gray-200 rounded-full flex items-center justify-center font-bold text-[#2C2C54] transition-colors"
                                      >
                                        -
                                      </button>

                                      <span className="text-sm font-extrabold w-4 text-center">
                                        {qty}
                                      </span>

                                      {/* Tombol Plus kembali normal, tidak ada blokir */}
                                      <button
                                        onClick={() =>
                                          updatePortion(index, person, 1)
                                        }
                                        className="w-7 h-7 bg-[#2C2C54] text-white hover:bg-[#2C2C54]/80 rounded-full flex items-center justify-center font-bold transition-colors"
                                      >
                                        +
                                      </button>
                                    </div>
                                  </div>
                                )
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                <button
                  onClick={calculateSplit}
                  className="w-full mt-8 bg-[#A40E4C] hover:bg-[#A40E4C]/90 text-white font-extrabold py-4 rounded-2xl shadow-lg transition-all active:scale-95 text-lg"
                >
                  Hitung Tagihan
                </button>
              </div>
            )}
          </div>
        )}

        {/* SECTION 3: FINAL RESULT (Tetap Sama) */}
        {finalBills && (
          // ... (Kode Section 3 sama persis seperti sebelumnya) ...
          <div className="bg-white p-6 sm:p-8 rounded-3xl shadow-2xl shadow-[#2C2C54]/10 border border-white space-y-6 relative overflow-hidden">
            <div className="absolute -top-10 -right-10 w-32 h-32 bg-[#F49D6E]/20 rounded-full blur-2xl"></div>
            <div className="text-center border-b border-[#ACC3A6]/20 pb-6 relative z-10">
              <h2 className="text-3xl font-extrabold text-[#A40E4C]">
                Bill Selesai! 🎉
              </h2>
            </div>
            <div className="space-y-4 relative z-10">
              {Object.entries(finalBills).map(([person, bill]) => (
                <div
                  key={person}
                  className="bg-[#F5D6BA]/30 p-4 rounded-2xl border border-[#F5D6BA]"
                >
                  <h3 className="font-extrabold text-xl text-[#2C2C54] mb-3">
                    {person}
                  </h3>
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-sm font-medium text-[#2C2C54]/70">
                      <span>Subtotal Item</span>
                      <span>
                        Rp {Math.round(bill.subtotal).toLocaleString("id-ID")}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm font-medium text-[#2C2C54]/70">
                      <span>Pajak & Layanan</span>
                      <span>
                        Rp {Math.round(bill.extra).toLocaleString("id-ID")}
                      </span>
                    </div>
                    <div className="flex justify-between font-extrabold text-lg pt-2 mt-2 border-t border-[#ACC3A6]/20 text-[#A40E4C]">
                      <span>Total</span>
                      <span>
                        Rp {Math.round(bill.total).toLocaleString("id-ID")}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <button
              onClick={() => {
                setResult(null);
                setFinalBills(null);
              }}
              className="w-full mt-2 bg-[#2C2C54] text-white font-bold py-4 rounded-2xl"
            >
              Scan Struk Baru
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
