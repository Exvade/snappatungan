"use client";

import { useState } from "react";

// Tipe data yang diharapkan dari AI
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

  // State untuk fitur Split Bill
  const [participants, setParticipants] = useState<string[]>([]);
  const [newParticipant, setNewParticipant] = useState("");
  // Mapping index item ke array nama partisipan (misal item 0 dimakan oleh "Budi" dan "Siti")
  const [assignments, setAssignments] = useState<Record<number, string[]>>({});
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
      const currentAssigned = prev[itemIndex] || [];
      const isAssigned = currentAssigned.includes(person);

      return {
        ...prev,
        [itemIndex]: isAssigned
          ? currentAssigned.filter((p) => p !== person) // Hapus jika sudah ada
          : [...currentAssigned, person], // Tambah jika belum ada
      };
    });
  };

  const calculateSplit = () => {
    if (!result) return;

    const bills: Record<
      string,
      { subtotal: number; extra: number; total: number }
    > = {};

    // Inisialisasi tagihan per orang
    participants.forEach((p) => {
      bills[p] = { subtotal: 0, extra: 0, total: 0 };
    });

    // Hitung subtotal masing-masing dari menu yang di-assign
    result.items.forEach((item, index) => {
      const assignedTo = assignments[index] || [];
      if (assignedTo.length > 0) {
        const splitPrice = item.price / assignedTo.length;
        assignedTo.forEach((person) => {
          if (bills[person]) bills[person].subtotal += splitPrice;
        });
      }
    });

    // Hitung proporsi pajak & layanan
    const totalExtra = (result.tax || 0) + (result.service_charge || 0);
    const validSubtotal = result.subtotal || 1; // Mencegah pembagian dengan nol

    participants.forEach((person) => {
      const ratio = bills[person].subtotal / validSubtotal;
      const personExtra = ratio * totalExtra;

      bills[person].extra = personExtra;
      bills[person].total = bills[person].subtotal + personExtra;
    });

    setFinalBills(bills);
  };

  return (
    <main className="min-h-screen p-8 bg-gray-50 text-gray-900 pb-20">
      <div className="max-w-xl mx-auto space-y-8">
        <h1 className="text-3xl font-bold text-center">SnapPatungan 📸</h1>

        {/* SECTION 1: UPLOAD */}
        {!result && (
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 text-center space-y-4">
            <p className="text-gray-600">
              Upload struk makananmu untuk memulai
            </p>
            <input
              type="file"
              accept="image/*"
              onChange={handleFileUpload}
              className="block w-full text-sm text-gray-900 border border-gray-300 rounded-lg cursor-pointer bg-gray-50 p-2"
            />
            {loading && (
              <p className="text-blue-600 animate-pulse font-medium">
                Memproses dengan AI... 🤖
              </p>
            )}
          </div>
        )}

        {/* SECTION 2: INTERACTIVE SPLIT */}
        {result && !finalBills && (
          <div className="space-y-6">
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
              <h2 className="text-lg font-bold mb-4">
                1. Siapa aja yang ikut patungan?
              </h2>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newParticipant}
                  onChange={(e) => setNewParticipant(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addParticipant()}
                  placeholder="Nama teman..."
                  className="flex-1 border p-2 rounded-lg"
                />
                <button
                  onClick={addParticipant}
                  className="bg-blue-600 text-white px-4 py-2 rounded-lg font-medium"
                >
                  Tambah
                </button>
              </div>
              <div className="flex flex-wrap gap-2 mt-4">
                {participants.map((p) => (
                  <span
                    key={p}
                    className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm font-medium"
                  >
                    {p}
                  </span>
                ))}
              </div>
            </div>

            {participants.length > 0 && (
              <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                <h2 className="text-lg font-bold mb-4">
                  2. Assign Menu ke Orang
                </h2>
                <div className="space-y-4">
                  {result.items.map((item, index) => (
                    <div key={index} className="border-b pb-4 last:border-0">
                      <div className="flex justify-between mb-2">
                        <span className="font-medium">
                          {item.name} (x{item.qty})
                        </span>
                        <span className="text-gray-600">
                          Rp {item.price.toLocaleString("id-ID")}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {participants.map((person) => {
                          const isSelected = (
                            assignments[index] || []
                          ).includes(person);
                          return (
                            <button
                              key={person}
                              onClick={() => toggleAssignment(index, person)}
                              className={`px-3 py-1 rounded-md text-sm transition-colors ${
                                isSelected
                                  ? "bg-green-500 text-white"
                                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                              }`}
                            >
                              {person}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>

                <button
                  onClick={calculateSplit}
                  className="w-full mt-6 bg-green-600 hover:bg-green-700 text-white font-bold py-3 rounded-lg transition-colors"
                >
                  Hitung Tagihan Sekarang!
                </button>
              </div>
            )}
          </div>
        )}

        {/* SECTION 3: FINAL RESULT */}
        {finalBills && (
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 space-y-4">
            <h2 className="text-2xl font-bold text-center text-green-600 mb-6">
              🎉 Tagihan Siap!
            </h2>
            {Object.entries(finalBills).map(([person, bill]) => (
              <div key={person} className="border-b pb-3 last:border-0">
                <h3 className="font-bold text-lg">{person}</h3>
                <div className="flex justify-between text-sm text-gray-600">
                  <span>Subtotal Menu:</span>
                  <span>
                    Rp {Math.round(bill.subtotal).toLocaleString("id-ID")}
                  </span>
                </div>
                <div className="flex justify-between text-sm text-gray-600">
                  <span>Pajak & Layanan Proporsional:</span>
                  <span>
                    Rp {Math.round(bill.extra).toLocaleString("id-ID")}
                  </span>
                </div>
                <div className="flex justify-between font-bold text-lg mt-1 text-gray-900">
                  <span>Total Bayar:</span>
                  <span>
                    Rp {Math.round(bill.total).toLocaleString("id-ID")}
                  </span>
                </div>
              </div>
            ))}

            <button
              onClick={() => {
                setResult(null);
                setFinalBills(null);
              }}
              className="w-full mt-4 bg-gray-200 hover:bg-gray-300 text-gray-800 font-medium py-3 rounded-lg"
            >
              Mulai Ulang
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
