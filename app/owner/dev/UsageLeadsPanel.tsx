"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { OwnerDevStats } from "./OwnerDevDashboard";

export function UsageLeadsPanel({ stats }: { stats: OwnerDevStats }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Usage and leads</CardTitle>
        <CardDescription>Aggregate counts (service role on the server). Recent leads for quick inspection.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Organizations" value={stats.organizationCount} />
          <Stat label="Profiles" value={stats.profileCount} />
          <Stat label="Deal scans (all time)" value={stats.dealScanCount} />
          <Stat label="Leads" value={stats.leadCount} />
        </div>

        <div>
          <h3 className="mb-2 text-sm font-medium">Recent leads</h3>
          <div className="overflow-x-auto rounded-lg border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead className="hidden sm:table-cell">Name</TableHead>
                  <TableHead className="hidden md:table-cell">Source</TableHead>
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stats.recentLeads.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-muted-foreground">
                      No leads yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  stats.recentLeads.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="max-w-[200px] truncate font-mono text-xs">{row.email}</TableCell>
                      <TableCell className="hidden text-muted-foreground sm:table-cell">{row.name ?? "—"}</TableCell>
                      <TableCell className="hidden md:table-cell">{row.source ?? "—"}</TableCell>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                        {new Date(row.created_at).toLocaleString()}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border bg-muted/20 px-4 py-3">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}
