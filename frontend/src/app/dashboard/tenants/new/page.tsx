"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import api from "@/lib/api";

const PLANS = ["starter", "pro", "enterprise"];

function slugify(str: string) {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export default function NewTenantPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    name: "",
    slug: "",
    plan: "starter",
    adminEmail: "",
    adminFirstName: "",
    adminLastName: "",
    adminPassword: "",
    maxEmployees: 100,
    maxDocuments: 500,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function setField(field: string, value: string | number) {
    setForm((f) => {
      const updated = { ...f, [field]: value };
      if (field === "name") updated.slug = slugify(value as string);
      return updated;
    });
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      await api.post("/tenants", form);
      router.push("/dashboard/tenants");
    } catch (err: unknown) {
      const data = (err as { response?: { data?: { message?: string; error?: string; errors?: { msg: string }[] } } })?.response?.data;
      const msg =
        data?.message ??
        data?.error ??
        (data?.errors?.length ? data.errors.map((e) => e.msg).join(", ") : null) ??
        "Failed to create tenant.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  const inputStyle = {
    width: "100%",
    padding: "0.625rem 0.875rem",
    background: "#1a1f2e",
    border: "1px solid var(--border)",
    borderRadius: 8,
    color: "var(--text-primary)",
    fontSize: "0.875rem",
    outline: "none",
  };

  const labelStyle = {
    display: "block" as const,
    marginBottom: "0.375rem",
    fontSize: "0.8125rem",
    fontWeight: 500,
    color: "var(--text-secondary)",
  };

  return (
    <div style={{ maxWidth: 640 }}>
      {/* Header */}
      <div style={{ marginBottom: "1.75rem" }}>
        <button
          onClick={() => router.back()}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.375rem",
            background: "transparent",
            border: "none",
            color: "var(--text-secondary)",
            fontSize: "0.875rem",
            cursor: "pointer",
            marginBottom: "0.75rem",
            padding: 0,
          }}
        >
          ← Back
        </button>
        <h1 style={{ fontSize: "1.375rem", fontWeight: 700, letterSpacing: "-0.02em", color: "var(--text-primary)" }}>
          New Company
        </h1>
        <p style={{ marginTop: "0.25rem", color: "var(--text-secondary)", fontSize: "0.875rem" }}>
          Create a new tenant and their admin account.
        </p>
      </div>

      <div
        style={{
          background: "var(--bg-card)",
          border: "1px solid var(--border)",
          borderRadius: 12,
          padding: "1.75rem",
        }}
      >
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
            <div>
              <label style={labelStyle}>Company name</label>
              <input
                style={inputStyle}
                value={form.name}
                onChange={(e) => setField("name", e.target.value)}
                required
                placeholder="Acme Corp"
              />
            </div>
            <div>
              <label style={labelStyle}>Slug</label>
              <input
                style={{ ...inputStyle, fontFamily: "var(--font-dm-mono)", fontSize: "0.8125rem" }}
                value={form.slug}
                onChange={(e) => setField("slug", e.target.value)}
                required
                placeholder="acme-corp"
              />
            </div>
          </div>

          <div>
            <label style={labelStyle}>Plan</label>
            <select
              style={{ ...inputStyle, cursor: "pointer" }}
              value={form.plan}
              onChange={(e) => setField("plan", e.target.value)}
            >
              {PLANS.map((p) => (
                <option key={p} value={p} style={{ background: "#1a1f2e" }}>
                  {p.charAt(0).toUpperCase() + p.slice(1)}
                </option>
              ))}
            </select>
          </div>

          <div
            style={{
              borderTop: "1px solid var(--border)",
              paddingTop: "1.25rem",
            }}
          >
            <h3 style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "1rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Admin Account
            </h3>
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                <div>
                  <label style={labelStyle}>First name</label>
                  <input style={inputStyle} value={form.adminFirstName} onChange={(e) => setField("adminFirstName", e.target.value)} required placeholder="John" />
                </div>
                <div>
                  <label style={labelStyle}>Last name</label>
                  <input style={inputStyle} value={form.adminLastName} onChange={(e) => setField("adminLastName", e.target.value)} required placeholder="Doe" />
                </div>
              </div>
              <div>
                <label style={labelStyle}>Admin email</label>
                <input type="email" style={inputStyle} value={form.adminEmail} onChange={(e) => setField("adminEmail", e.target.value)} required placeholder="admin@acme.com" />
              </div>
              <div>
                <label style={labelStyle}>Temporary password</label>
                <input type="password" style={inputStyle} value={form.adminPassword} onChange={(e) => setField("adminPassword", e.target.value)} required placeholder="••••••••" />
              </div>
            </div>
          </div>

          <div
            style={{
              borderTop: "1px solid var(--border)",
              paddingTop: "1.25rem",
            }}
          >
            <h3 style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "1rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Limits
            </h3>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
              <div>
                <label style={labelStyle}>Max employees</label>
                <input
                  type="number"
                  style={inputStyle}
                  value={form.maxEmployees}
                  onChange={(e) => setField("maxEmployees", parseInt(e.target.value))}
                  min={1}
                />
              </div>
              <div>
                <label style={labelStyle}>Max documents</label>
                <input
                  type="number"
                  style={inputStyle}
                  value={form.maxDocuments}
                  onChange={(e) => setField("maxDocuments", parseInt(e.target.value))}
                  min={1}
                />
              </div>
            </div>
          </div>

          {error && (
            <div style={{ padding: "0.625rem 0.875rem", background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 8, color: "#f87171", fontSize: "0.8125rem" }}>
              {error}
            </div>
          )}

          <div style={{ display: "flex", gap: "0.75rem", justifyContent: "flex-end" }}>
            <button
              type="button"
              onClick={() => router.back()}
              style={{
                padding: "0.625rem 1.25rem",
                background: "transparent",
                border: "1px solid var(--border)",
                borderRadius: 8,
                color: "var(--text-secondary)",
                fontSize: "0.875rem",
                cursor: "pointer",
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              style={{
                padding: "0.625rem 1.25rem",
                background: "var(--accent)",
                color: "#fff",
                border: "none",
                borderRadius: 8,
                fontSize: "0.875rem",
                fontWeight: 600,
                cursor: loading ? "not-allowed" : "pointer",
                opacity: loading ? 0.7 : 1,
              }}
            >
              {loading ? "Creating..." : "Create Company"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
