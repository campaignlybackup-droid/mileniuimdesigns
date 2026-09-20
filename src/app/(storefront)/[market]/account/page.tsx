"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter, useParams } from "next/navigation";
import { Button } from "@/components/ui/Button";
import type { CustomerProfile } from "@/lib/customers";

export default function AccountPage() {
  const router = useRouter();
  const params = useParams();
  const marketParam = (params?.market as string) || "us";
  const marketCode = marketParam.toUpperCase();

  const [profile, setProfile] = useState<CustomerProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let ignore = false;
    fetch("/api/customer/me")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!ignore) {
          if (!data?.authenticated) {
            const loginUrl = marketCode.toLowerCase() === "us" ? "/login" : `/${marketCode.toLowerCase()}/login`;
            router.push(loginUrl);
          } else {
            setProfile(data.customer);
          }
        }
      })
      .catch((err) => console.error(err))
      .finally(() => {
        if (!ignore) setLoading(false);
      });

    return () => {
      ignore = true;
    };
  }, [router, marketCode]);

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    const homeUrl = marketCode.toLowerCase() === "us" ? "/" : `/${marketCode.toLowerCase()}`;
    router.push(homeUrl);
  };

  if (loading) {
    return (
      <div style={{ padding: "80px var(--md-gutter)", textAlign: "center" }}>
        <p style={{ color: "var(--md-fg-muted)" }}>Accessing client vault…</p>
      </div>
    );
  }

  if (!profile) return null;

  return (
    <div
      style={{
        maxWidth: "var(--md-container)",
        marginInline: "auto",
        padding: "var(--md-space-8) var(--md-gutter)",
      }}
    >
      {/* Account Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-end",
          borderBottom: "1px solid var(--md-rule)",
          paddingBottom: "var(--md-space-4)",
          marginBottom: "var(--md-space-8)",
        }}
      >
        <div>
          <p
            style={{
              fontSize: "0.75rem",
              textTransform: "uppercase",
              letterSpacing: "0.15em",
              color: "var(--md-green)",
              fontWeight: 600,
              margin: "0 0 var(--md-space-2)",
            }}
          >
            Private Client Vault
          </p>
          <h1
            style={{
              fontFamily: "var(--md-font-display)",
              fontSize: "2.25rem",
              fontWeight: 500,
              margin: 0,
              color: "var(--md-fg)",
            }}
          >
            Welcome, {profile.firstName ?? profile.email.split("@")[0]}
          </h1>
          <p style={{ fontSize: "0.875rem", color: "var(--md-fg-muted)", margin: "4px 0 0" }}>
            {profile.email} {profile.phone ? `• ${profile.phone}` : ""}
          </p>
        </div>

        <Button variant="outline" size="sm" onClick={handleLogout}>
          Sign Out
        </Button>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
          gap: "var(--md-space-8)",
        }}
      >
        {/* Left Column: Order History */}
        <section style={{ gridColumn: "span 2" }}>
          <h2
            style={{
              fontFamily: "var(--md-font-display)",
              fontSize: "1.5rem",
              margin: "0 0 var(--md-space-5)",
              color: "var(--md-fg)",
            }}
          >
            Acquisitions & Order History ({profile.orders.length})
          </h2>

          {profile.orders.length === 0 ? (
            <div
              style={{
                background: "var(--md-bg)",
                border: "1px solid var(--md-rule)",
                padding: "var(--md-space-8)",
                textAlign: "center",
              }}
            >
              <p style={{ color: "var(--md-fg-muted)", marginBottom: "var(--md-space-4)" }}>
                You have not placed any orders yet.
              </p>
              <Link href={marketCode.toLowerCase() === "us" ? "/" : `/${marketCode.toLowerCase()}`}>
                <Button variant="primary" size="md">
                  Explore Collections
                </Button>
              </Link>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--md-space-5)" }}>
              {profile.orders.map((order) => (
                <div
                  key={order.id}
                  style={{
                    background: "var(--md-bg)",
                    border: "1px solid var(--md-rule)",
                    padding: "var(--md-space-6)",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "baseline",
                      borderBottom: "1px solid var(--md-rule)",
                      paddingBottom: "var(--md-space-3)",
                      marginBottom: "var(--md-space-4)",
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 600, fontSize: "1rem" }}>{order.orderNumber}</div>
                      <div style={{ fontSize: "0.75rem", color: "var(--md-fg-muted)" }}>
                        Placed on {new Date(order.placedAt).toLocaleDateString()}
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontWeight: 600, fontSize: "1.125rem", color: "var(--md-fg)" }}>
                        {order.formattedTotal}
                      </div>
                      <span
                        style={{
                          fontSize: "0.6875rem",
                          textTransform: "uppercase",
                          letterSpacing: "0.08em",
                          padding: "2px 8px",
                          borderRadius: "var(--md-radius-sm)",
                          background: "var(--md-bg-subtle, var(--md-rule))",
                          color: "var(--md-green)",
                          fontWeight: 600,
                        }}
                      >
                        {order.status}
                      </span>
                    </div>
                  </div>

                  {/* Items */}
                  <div style={{ display: "flex", flexDirection: "column", gap: "var(--md-space-3)" }}>
                    {order.items.map((item) => (
                      <div key={item.id} style={{ display: "flex", gap: "var(--md-space-4)", alignItems: "center" }}>
                        <div
                          style={{
                            position: "relative",
                            width: 50,
                            height: 60,
                            background: "var(--md-bg-raised)",
                            flexShrink: 0,
                            overflow: "hidden",
                          }}
                        >
                          <Image src={item.imageUrl} alt={item.productTitle} fill sizes="50px" style={{ objectFit: "cover" }} />
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 500, fontSize: "0.875rem" }}>{item.productTitle}</div>
                          <div style={{ fontSize: "0.75rem", color: "var(--md-fg-secondary)" }}>
                            Qty: {item.quantity} • SKU: {item.sku}
                          </div>
                        </div>
                        <div style={{ fontSize: "0.875rem", fontWeight: 500 }}>
                          {item.formattedLineSubtotal}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div
                    style={{
                      marginTop: "var(--md-space-4)",
                      paddingTop: "var(--md-space-3)",
                      borderTop: "1px solid var(--md-rule)",
                      display: "flex",
                      justifyContent: "flex-end",
                    }}
                  >
                    <a
                      href={`https://wa.me/919820000000?text=${encodeURIComponent(
                        `Hi Millennium Designs, I would like to inquire about my order ${order.orderNumber}.`,
                      )}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        fontSize: "0.8125rem",
                        color: "var(--md-green)",
                        textDecoration: "underline",
                      }}
                    >
                      Inquire via WhatsApp
                    </a>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Right Column: Profile & Addresses */}
        <aside style={{ display: "flex", flexDirection: "column", gap: "var(--md-space-6)" }}>
          <div
            style={{
              background: "var(--md-bg)",
              border: "1px solid var(--md-rule)",
              padding: "var(--md-space-6)",
            }}
          >
            <h2
              style={{
                fontFamily: "var(--md-font-display)",
                fontSize: "1.25rem",
                margin: "0 0 var(--md-space-4)",
                color: "var(--md-fg)",
              }}
            >
              Client Information
            </h2>
            <div style={{ fontSize: "0.875rem", display: "flex", flexDirection: "column", gap: "var(--md-space-2)" }}>
              <div>
                <strong style={{ color: "var(--md-fg-secondary)" }}>Email:</strong> {profile.email}
              </div>
              <div>
                <strong style={{ color: "var(--md-fg-secondary)" }}>Mobile:</strong> {profile.phone ?? "Not configured"}
              </div>
              <div>
                <strong style={{ color: "var(--md-fg-secondary)" }}>Market:</strong> {profile.defaultMarketCode ?? marketCode}
              </div>
            </div>
          </div>

          <div
            style={{
              background: "var(--md-bg)",
              border: "1px solid var(--md-rule)",
              padding: "var(--md-space-6)",
            }}
          >
            <h2
              style={{
                fontFamily: "var(--md-font-display)",
                fontSize: "1.25rem",
                margin: "0 0 var(--md-space-4)",
                color: "var(--md-fg)",
              }}
            >
              Saved Addresses ({profile.addresses.length})
            </h2>

            {profile.addresses.length === 0 ? (
              <p style={{ fontSize: "0.875rem", color: "var(--md-fg-muted)", margin: 0 }}>
                No delivery addresses saved yet. Addresses entered during checkout will be preserved here.
              </p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--md-space-3)" }}>
                {profile.addresses.map((addr) => (
                  <div
                    key={addr.id}
                    style={{
                      border: "1px solid var(--md-rule)",
                      padding: "var(--md-space-3)",
                      fontSize: "0.8125rem",
                      lineHeight: 1.5,
                    }}
                  >
                    <div style={{ fontWeight: 600 }}>{addr.recipientName}</div>
                    <div>{addr.line1}</div>
                    {addr.line2 && <div>{addr.line2}</div>}
                    <div>
                      {addr.city}, {addr.region} {addr.postalCode}
                    </div>
                    <div>{addr.countryCode}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
