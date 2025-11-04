"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useAuthState } from "react-firebase-hooks/auth";
import { auth, db } from "@/lib/firebase";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
  limit as qLimit,
  startAfter,
  DocumentData,
  QueryDocumentSnapshot,
  getCountFromServer,
} from "firebase/firestore";

// ------------ Tipos ------------
type CategoryDoc = {
  name: string;
  emoji?: string;
  color?: string;
  order?: number;
  isDefault?: boolean;
  createdAt?: any;
};
type Category = CategoryDoc & { id?: string };

// ------------ Página ------------
export default function CategoriesPage() {
  const [user, loading] = useAuthState(auth);
  const uid = user?.uid || null;

  const [categories, setCategories] = useState<Category[]>([]);

  // Crear nueva
  const [newName, setNewName] = useState("");
  const [newEmoji, setNewEmoji] = useState("");
  const [newColor, setNewColor] = useState("#22c55e");

  // Edición
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editEmoji, setEditEmoji] = useState("");
  const [editColor, setEditColor] = useState("#22c55e");

  // Borrado con reemplazo
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [replaceWith, setReplaceWith] = useState<string>("");

  // Contadores por categoría
  const [counts, setCounts] = useState<Record<string, number>>({});
  const nameById = useMemo(() => {
    const m: Record<string, string> = {};
    for (const c of categories) if (c.id) m[c.id] = c.name;
    return m;
  }, [categories]);

  // ---------- Carga de categorías ----------
  useEffect(() => {
    if (!uid) return;
    const qCats = query(
      collection(db, "users", uid, "categories"),
      orderBy("order", "asc")
    );
    const unsub = onSnapshot(qCats, (snap) => {
      const list: Category[] = [];
      snap.forEach((d) => list.push({ ...(d.data() as CategoryDoc), id: d.id }));
      setCategories(list);
    });
    return () => unsub();
  }, [uid]);

  // ---------- Contadores de gastos por categoría ----------
  useEffect(() => {
    if (!uid || categories.length === 0) {
      setCounts({});
      return;
    }
    (async () => {
      const map: Record<string, number> = {};
      for (const c of categories) {
        const qExp = query(
          collection(db, "users", uid, "expenses"),
          where("cat", "==", c.name)
        );
        const snap = await getCountFromServer(qExp);
        map[c.name] = snap.data().count;
      }
      setCounts(map);
    })();
  }, [uid, categories]);

  // ---------- Guardas de sesión ----------
  if (loading) return <div className="p-6">Cargando…</div>;
  if (!uid) {
    return (
      <main className="p-6 max-w-xl mx-auto">
        <h1 className="text-2xl font-bold mb-2">Categorías</h1>
        <p className="opacity-90">Inicia sesión.</p>
        <Link href="/" className="underline">Volver</Link>
      </main>
    );
  }

  // ---------- Acciones ----------
  async function createCategory() {
    if (!uid) return;
    const name = newName.trim();
    if (!name) return alert("Pon un nombre.");
    const exists = categories.some((c) => c.name.toLowerCase() === name.toLowerCase());
    if (exists) return alert("Esa categoría ya existe.");

    await addDoc(collection(db, "users", uid, "categories"), {
      name,
      emoji: newEmoji.trim(),
      color: newColor || "",
      order: (categories[categories.length - 1]?.order ?? 0) + 10,
      isDefault: false,
      createdAt: serverTimestamp(),
    });
    setNewName("");
    setNewEmoji("");
    setNewColor("#22c55e");
  }

  function startEdit(c: Category) {
    setEditingId(c.id || null);
    setEditName(c.name);
    setEditEmoji(c.emoji || "");
    setEditColor(c.color || "#22c55e");
  }

  function cancelEdit() {
    setEditingId(null);
    setEditName("");
    setEditEmoji("");
    setEditColor("#22c55e");
  }

  // Migra gastos cat: oldName -> newName en lotes
  async function migrateExpenses(oldName: string, newName: string) {
    if (!uid || oldName === newName) return 0;

    let last: QueryDocumentSnapshot<DocumentData> | null = null;
    let processed = 0;

    while (true) {
      let qExp = query(
        collection(db, "users", uid, "expenses"),
        where("cat", "==", oldName),
        qLimit(300)
      );
      if (last) {
        qExp = query(
          collection(db, "users", uid, "expenses"),
          where("cat", "==", oldName),
          startAfter(last),
          qLimit(300)
        );
      }

      const snap = await getDocs(qExp);
      if (snap.empty) break;

      const batch = writeBatch(db);
      snap.docs.forEach((d) => batch.update(d.ref, { cat: newName }));
      await batch.commit();

      processed += snap.size;
      last = snap.docs[snap.docs.length - 1];
      if (snap.size < 300) break;
    }
    return processed;
  }

  async function saveEdit() {
    if (!uid || !editingId) return;
    const catDoc = categories.find((c) => c.id === editingId);
    if (!catDoc) return;

    const oldName = catDoc.name;
    const nextName = editName.trim();
    const nextEmoji = editEmoji.trim();
    const nextColor = editColor;

    if (!nextName) return alert("Nombre requerido.");

    // Si cambia el nombre -> migrar gastos antes
    if (nextName.toLowerCase() !== oldName.toLowerCase()) {
      const ok = confirm(
        `Vas a renombrar "${oldName}" a "${nextName}". Esto migrará todos los gastos a la nueva categoría.\n¿Continuar?`
      );
      if (!ok) return;
      await migrateExpenses(oldName, nextName);
    }

    await updateDoc(doc(db, "users", uid, "categories", editingId), {
      name: nextName,
      emoji: nextEmoji,
      color: nextColor,
    });

    cancelEdit();
  }

  function askDelete(id: string) {
    setDeleteId(id);
    setReplaceWith("");
  }

  async function confirmDelete() {
    if (!uid || !deleteId) return;
    const del = categories.find((c) => c.id === deleteId);
    if (!del) return;

    const oldName = del.name;
    const replacement = replaceWith.trim();
    if (!replacement) return alert("Selecciona una categoría de reemplazo.");

    await migrateExpenses(oldName, replacement);
    await deleteDoc(doc(db, "users", uid, "categories", deleteId));

    setDeleteId(null);
    setReplaceWith("");
  }

  async function moveOrder(index: number, dir: -1 | 1) {
    if (!uid) return;
    const i2 = index + dir;
    if (i2 < 0 || i2 >= categories.length) return;
    const a = categories[index];
    const b = categories[i2];
    if (!a.id || !b.id) return;

    const batch = writeBatch(db);
    batch.update(doc(db, "users", uid, "categories", a.id), { order: b.order ?? 0 });
    batch.update(doc(db, "users", uid, "categories", b.id), { order: a.order ?? 0 });
    await batch.commit();
  }

  // ---------- UI ----------
  return (
    <main className="p-4 max-w-3xl mx-auto space-y-4">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-bold">📚 Categorías</h1>
        <Link href="/app" className="underline">← Volver al app</Link>
      </header>

      {/* Crear nueva */}
      <section className="rounded-2xl p-4 bg-white/5 border border-white/10 space-y-2">
        <h2 className="font-semibold">Crear categoría</h2>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
          <input
            placeholder="Nombre (p.ej. Supermercado)"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            className="bg-black/30 p-2 rounded"
          />
          <input
            placeholder="Emoji (🛒 opcional)"
            value={newEmoji}
            onChange={(e) => setNewEmoji(e.target.value)}
            className="bg-black/30 p-2 rounded"
          />
          <input
            type="color"
            title="Color (opcional)"
            value={newColor}
            onChange={(e) => setNewColor(e.target.value)}
            className="bg-black/30 p-2 rounded h-10"
          />
          <button onClick={createCategory} className="rounded px-3 py-2 bg-white text-black">
            Crear
          </button>
        </div>
        <p className="text-xs opacity-80">
          Consejo: usa nombres cortos y un emoji para reconocerlas rápido en el selector de gastos.
        </p>
      </section>

      {/* Listado */}
      <section className="rounded-2xl p-4 bg-white/5 border border-white/10">
        <h2 className="font-semibold mb-2">Tus categorías</h2>

        <table className="w-full text-sm">
          <thead className="opacity-80">
            <tr>
              <th className="text-left">Orden</th>
              <th className="text-left">Nombre</th>
              <th className="text-left">Emoji</th>
              <th className="text-left">Color</th>
              <th className="text-right">Gastos</th>
              <th className="text-right w-56">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {categories.map((c, i) => {
              const count = counts[c.name] ?? 0;
              const isEditing = editingId === c.id;
              return (
                <tr key={c.id || c.name} className="border-t border-white/10">
                  <td className="py-2">
                    <div className="flex gap-1">
                      <button className="px-2 py-1 bg-white/10 rounded" onClick={() => moveOrder(i, -1)}>▲</button>
                      <button className="px-2 py-1 bg-white/10 rounded" onClick={() => moveOrder(i, +1)}>▼</button>
                    </div>
                  </td>

                  {/* Nombre */}
                  <td>
                    {isEditing ? (
                      <input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="bg-black/30 p-1 rounded w-44"
                      />
                    ) : (
                      <span className="font-medium">{c.name}</span>
                    )}
                  </td>

                  {/* Emoji */}
                  <td>
                    {isEditing ? (
                      <input
                        value={editEmoji}
                        onChange={(e) => setEditEmoji(e.target.value)}
                        className="bg-black/30 p-1 rounded w-24"
                        placeholder="🛒"
                      />
                    ) : (
                      <span>{c.emoji || "—"}</span>
                    )}
                  </td>

                  {/* Color */}
                  <td>
                    {isEditing ? (
                      <input
                        type="color"
                        value={editColor}
                        onChange={(e) => setEditColor(e.target.value)}
                        className="bg-black/30 p-1 rounded h-8"
                      />
                    ) : (
                      <div className="inline-flex items-center gap-2">
                        <span
                          className="inline-block w-4 h-4 rounded"
                          style={{ background: c.color || "#8b5cf6" }}
                        />
                        <span className="opacity-80">{c.color || "—"}</span>
                      </div>
                    )}
                  </td>

                  {/* Contador */}
                  <td className="text-right">{count}</td>

                  {/* Acciones */}
                  <td className="text-right">
                    {isEditing ? (
                      <>
                        <button
                          onClick={saveEdit}
                          className="px-2 py-1 bg-emerald-500 text-black rounded mr-2"
                        >
                          Guardar
                        </button>
                        <button onClick={cancelEdit} className="px-2 py-1 bg-white/10 rounded">
                          Cancelar
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={() => startEdit(c)}
                          className="px-2 py-1 bg-white/10 rounded mr-2"
                        >
                          ✏️
                        </button>
                        <button
                          onClick={() => c.id && askDelete(c.id)}
                          className="px-2 py-1 bg-white/10 rounded"
                        >
                          🗑️
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
            {categories.length === 0 && (
              <tr>
                <td colSpan={6} className="py-3 opacity-70">
                  Aún no tienes categorías.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      {/* Modal de borrar con reemplazo */}
      {deleteId && (
        <section className="fixed inset-0 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-white/10 rounded-2xl p-4 w-full max-w-md">
            <h3 className="text-lg font-semibold mb-2">Eliminar categoría</h3>
            <p className="opacity-90 mb-3">
              Para mantener tus datos, elige una categoría a la que migrar los gastos existentes.
            </p>
            <select
              className="bg-black/30 p-2 rounded w-full mb-3"
              value={replaceWith}
              onChange={(e) => setReplaceWith(e.target.value)}
            >
              <option value="">— Selecciona reemplazo —</option>
              {categories
                .filter((c) => c.id !== deleteId)
                .map((c) => (
                  <option key={c.id || c.name} value={c.name}>
                    {c.emoji ? `${c.emoji} ${c.name}` : c.name}
                  </option>
                ))}
            </select>

            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  setDeleteId(null);
                  setReplaceWith("");
                }}
                className="px-3 py-2 bg-white/10 rounded"
              >
                Cancelar
              </button>
              <button
                onClick={confirmDelete}
                className="px-3 py-2 bg-red-500 text-black rounded"
              >
                Migrar y borrar
              </button>
            </div>
          </div>
        </section>
      )}
    </main>
  );
}
