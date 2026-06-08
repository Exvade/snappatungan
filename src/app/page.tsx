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
      { subtotal: number; extra: number; total: number }
    > = {};

    participants.forEach((p) => {
      bills[p] = { subtotal: 0, extra: 0, total: 0 };
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
        <div className="text-center space-y-1 mb-8">
          <h1 className="text-2xl font-bold tracking-widest uppercase border-b-2 border-zinc-800 inline-block pb-1">
            SNAP_PATUNGAN
          </h1>
          <p className="text-xs text-zinc-500 uppercase tracking-widest mt-2">
            Point of Sale System
          </p>
        </div>

        {/* SECTION 1: UPLOAD & LOADING */}
        {!result && (
          <div className="bg-zinc-50 p-6 shadow-md rounded-sm border border-zinc-300 relative overflow-hidden">
            {!loading ? (
              <label className="flex flex-col items-center justify-center w-full h-48 border-2 border-dashed border-zinc-400 hover:border-zinc-800 hover:bg-zinc-100 cursor-pointer transition-colors group">
                <div className="flex flex-col items-center justify-center pt-5 pb-6">
                  <svg
                    className="w-10 h-10 text-zinc-400 group-hover:text-zinc-800 mb-3 transition-colors"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
                    ></path>
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"
                    ></path>
                  </svg>
                  <p className="text-sm font-semibold uppercase tracking-wider text-zinc-600 group-hover:text-zinc-900">
                    Upload Struk
                  </p>
                </div>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </label>
            ) : (
              <div className="flex flex-col items-center justify-center py-10 space-y-4">
                <div className="w-20 h-24 border border-zinc-300 bg-white shadow-inner flex flex-col items-center p-2 overflow-hidden relative">
                  {/* Animasi Kertas Keluar */}
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
                            className="bg-zinc-200 text-zinc-800 px-3 py-1 text-xs font-bold uppercase rounded-sm"
                          >
                            {p}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Assign Menu */}
                  {participants.length > 0 && (
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
                  )}
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
                        <div className="space-y-1 text-xs">
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
                      </div>
                    ))}
                  </div>

                  <div className="text-center pt-8 space-y-1">
                    <p className="text-xs uppercase font-bold">TERIMA KASIH</p>
                    <p className="text-[10px] text-zinc-500">
                      POWERED BY GEMINI 3.5 FLASH
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
    </main>
  );
}
