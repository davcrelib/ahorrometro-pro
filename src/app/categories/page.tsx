"use client";

import { auth, db } from "@/lib/firebase";
import { useAuthState } from "react-firebase-hooks/auth";
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  addDoc,
  serverTimestamp,
  doc,
  updateDoc,
  deleteDoc,
  where,
  getDocs,
  writeBatch,
  getCountFromServer,
} from "firebase/firestore";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

// ---- Tipos ----
interface Category {
  id: string;
  name: string;
  createdAt?: any;
}

export default function CategoriesPage() {
  const [user] = useAuthState(auth);
  const [cats, setCats] = useState<Category[]>([]);
  const [newCat, setNewCat] = useState("");
  const [filter, setFilter] = useState("");

  // UI estado para renombrar
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState<string>("");

  // UI estado para borrar/migrar
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [targetName, setTargetName] = useState<string>("");
  const [deleteCount, setDeleteCount] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string>("");

  useEffect(() => {
    if (!user) return;
    const qCats = query(
      collection(db, "users", user.uid, "categories"),
      orderBy("name")
    );
    const unsub = onSnapshot(qCats, (snap) => {
      const rows: Category[] = [];
      snap.forEach((d) => rows.push({ id: d.id, ...(d.data() as any) }));
      setCats(rows);
    });
    return () => unsub();
  }, [user]);

  const filtered = useMemo(() => {
    const f = filter.trim().toLowerCase();
    if (!f) return cats;
    return cats.filter((c) => c.name.toLowerCase().includes(f));
  }, [cats, filter]);

  async function createCategory() {
    if (!user) return;
    const name = newCat.trim();
    if (!name) return;

    // anti-duplicado (case-insensitive)
    if (cats.some((c) => c.name.toLowerCase() === name.toLowerCase())) {
      alert("Esa categoría ya existe.");
      return;
    }

    await addDoc(collection(db, "users", user.uid, "categories"), {
      name,
      createdAt: serverTimestamp(),
    });
    setNewCat("");
  }

  function startEdit(c: Category) {
    setEditingId(c.id);
    setEditingName(c.name);
  }
  function cancelEdit() {
    setEditingId(null);
    setEditingName("");
  }
  async function saveEdit() {
    if (!user || !editingId) return;
    const name = editingName.trim();
    if (!name) return;
    if (cats.some((c) => c.id !== editingId && c.name.toLowerCase() === name.toLowerCase())) {
      alert("Ya existe otra categoría con ese nombre.");
      return;
    }
    await updateDoc(doc(db, "users", user.uid, "categories", editingId), { name });
    setEditingId(null);
    setEditingName("");
  }

  // --- Borrar con migración ---
  async function openDelete(c: Category) {
    if (!user) return;
    setDeletingId(c.id);
    // sugerir destino distinto
    const alt = cats.find((x) => x.id !== c.id)?.name || "Otros";
    setTargetName(alt);

    // contar gastos a migrar
    try {
      const ref = collection(db, "users", user.uid, "expenses");
      const countSnap = await getCountFromServer(query(ref, where("cat", "==", c.name)));
      setDeleteCount(countSnap.data().count);
    } catch (e) {
      setDeleteCount(null);
    }
  }

  function closeDelete() {
    setDeletingId(null);
    setTargetName("");
    setDeleteCount(null);
  }

  async function confirmDelete() {
    if (!user || !deletingId) return;
    const catToDelete = cats.find((c) => c.id === deletingId);
    if (!catToDelete) return;

    const target = (targetName || "").trim();
    if (!target) {
      alert("Elige o escribe una categoría destino para migrar los gastos.");
      return;
    }
    if (target.toLowerCase() === catToDelete.name.toLowerCase()) {
      alert("La categoría destino debe ser distinta.");
      return;
    }

    setBusy(true);
    setProgress("Preparando migración…");

    try {
      // si la categoría destino no existe, créala
      let targetId = cats.find((c) => c.name.toLowerCase() === target.toLowerCase())?.id;
      if (!targetId) {
        const added = await addDoc(collection(db, "users", user.uid, "categories"), {
          name: target,
          createdAt: serverTimestamp(),
        });
        targetId = added.id;
      }

      // migrar gastos por lotes
      const ref = collection(db, "users", user.uid, "expenses");
      const pageSize = 400;
      let moved = 0;
      while (true) {
        const snap = await getDocs(query(ref, where("cat", "==", catToDelete.name), orderBy("createdAt", "desc"), limitFor(pageSize)));
        if (snap.empty) break;
        const batch = writeBatch(db);
        snap.docs.forEach((d) => {
          batch.update(d.ref, { cat: target });
        });
        await batch.commit();
        moved += snap.size;
        setProgress(`Migrados ${moved} gastos…`);
        if (snap.size < pageSize) break;
      }

      // borrar categoría
      await deleteDoc(doc(db, "users", user.uid, "categories", deletingId));
      setProgress("Categoría eliminada ✔️");
      closeDelete();
    } catch (e: any) {
      console.error(e);
      alert("No se pudo completar la operación: " + e?.message);
    } finally {
      setBusy(false);
      setProgress("");
    }
  }

  // helper para evitar dependencia directa de limit() en import principal
  function limitFor(n: number) {
    // Importación tardía de limit() para no romper el tree-shaking si cambia la API
    // @ts-ignore
    return (window as any).firebaseLimit ? (window as any).firebaseLimit(n) : (require("firebase/firestore").limit(n));
  }

  if (!user) {
    return (
      <main className="p-6 max-w-3xl mx-auto">
        <h1 className="text-2xl font-bold mb-2">Categorías</h1>
        <p className="opacity-80">Inicia sesión para gestionar tus categorías.</p>
        <Link className="underline" href="/">Volver</Link>
      </main>
    );
  }

  return (
    <main className="p-4 max-w-3xl mx-auto space-y-4">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-bold">📁 Categorías</h1>
        <Link className="px-3 py-1 bg-white/10 rounded" href="/app">← Volver al app</Link>
      </header>

      <section className="rounded-2xl p-4 bg-white/5 border border-white/10 space-y-3">
        <div className="flex flex-col md:flex-row gap-2 md:items-center md:justify-between">
          <div className="flex gap-2 items-center">
            <input
              value={newCat}
              onChange={(e) => setNewCat(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") createCategory(); }}
              placeholder="Nueva categoría (p.ej. Mascotas)"
              className="bg-black/30 p-2 rounded w-64"
            />
            <button onClick={createCategory} className="px-3 py-2 bg-white text-black rounded">➕ Añadir</button>
          </div>
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filtrar…"
            className="bg-black/30 p-2 rounded md:w-60"
          />
        </div>

        <table className="w-full text-sm">
          <thead className="opacity-80">
            <tr>
              <th className="text-left">Nombre</th>
              <th className="text-right w-56">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((c) => (
              <tr key={c.id} className="border-t border-white/10">
                <td>
                  {editingId === c.id ? (
                    <input
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                      className="bg-black/30 p-1 rounded w-full"
                      autoFocus
                    />
                  ) : (
                    <span>{c.name}</span>
                  )}
                </td>
                <td className="text-right">
                  {editingId === c.id ? (
                    <>
                      <button onClick={saveEdit} className="px-2 py-1 bg-emerald-500 text-black rounded mr-2">Guardar</button>
                      <button onClick={cancelEdit} className="px-2 py-1 bg-white/10 rounded">Cancelar</button>
                    </>
                  ) : (
                    <>
                      <button onClick={() => startEdit(c)} className="px-2 py-1 bg-white/10 rounded mr-2">✏️ Renombrar</button>
                      <button onClick={() => openDelete(c)} className="px-2 py-1 bg-white/10 rounded">🗑️ Borrar</button>
                    </>
                  )}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={2} className="py-3 opacity-70">No hay categorías que coincidan.</td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      {/* Modal borrar/migrar */}
      {deletingId && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
          <div className="bg-zinc-900 border border-white/10 rounded-2xl p-4 w-full max-w-lg space-y-3">
            <h3 className="text-lg font-semibold">Borrar categoría</h3>
            {(() => {
              const c = cats.find((x) => x.id === deletingId);
              return <p>Vas a borrar <b>{c?.name}</b>. Debes migrar sus gastos a otra categoría.</p>;
            })()}

            <div className="text-sm opacity-80">
              {deleteCount === null ? "Contando gastos…" : `Gastos en la categoría: ${deleteCount}`}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <select
                value={targetName}
                onChange={(e) => setTargetName(e.target.value)}
                className="bg-black/30 p-2 rounded"
              >
                {cats
                  .filter((x) => x.id !== deletingId)
                  .map((x) => (
                    <option key={x.id} value={x.name}>{x.name}</option>
                  ))}
              </select>
              <input
                value={targetName}
                onChange={(e) => setTargetName(e.target.value)}
                placeholder="O escribe un nombre nuevo…"
                className="bg-black/30 p-2 rounded"
              />
            </div>

            {busy && <div className="text-sm">{progress || "Trabajando…"}</div>}

            <div className="flex justify-end gap-2">
              <button onClick={closeDelete} disabled={busy} className="px-3 py-2 bg-white/10 rounded">Cancelar</button>
              <button onClick={confirmDelete} disabled={busy} className="px-3 py-2 bg-red-500 text-black rounded">Borrar y migrar</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
