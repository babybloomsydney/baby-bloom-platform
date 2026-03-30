"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { UserAvatar } from "@/components/dashboard/UserAvatar";
import { formatRelativeTime } from "@/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ParentIDCheckModal } from "./ParentIDCheckModal";
import type { PendingParentIdentityCheck } from "./ParentIDCheckModal";
import { ShieldCheck, Clock, CheckCircle2, XCircle, FileText } from "lucide-react";

interface ParentVerificationTabProps {
  stats: {
    pending: number;
    approvedToday: number;
    rejectedToday: number;
  };
  parentChecks: PendingParentIdentityCheck[];
}

function getVerificationStatusLabel(status: number): { label: string; color: string } {
  switch (status) {
    case 10:
      return { label: "Pending AI", color: "text-blue-600 bg-blue-50" };
    case 11:
      return { label: "Pending Review", color: "text-amber-600 bg-amber-50" };
    case 12:
      return { label: "AI Failed", color: "text-red-600 bg-red-50" };
    case 13:
      return { label: "Admin Rejected", color: "text-red-600 bg-red-50" };
    default:
      return { label: "Unknown", color: "text-gray-600 bg-gray-50" };
  }
}

function getConfidenceColor(confidence: number | null): string {
  if (confidence === null) return "text-gray-400";
  if (confidence >= 75) return "text-green-600";
  if (confidence >= 50) return "text-amber-600";
  return "text-red-600";
}

export function ParentVerificationTab({ stats, parentChecks }: ParentVerificationTabProps) {
  const [selectedCheck, setSelectedCheck] = useState<PendingParentIdentityCheck | null>(null);

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium text-gray-600">Pending Reviews</div>
                <div className="text-3xl font-bold text-amber-600">{stats.pending}</div>
              </div>
              <div className="w-12 h-12 bg-amber-100 rounded-full flex items-center justify-center">
                <Clock className="w-6 h-6 text-amber-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium text-gray-600">Approved Today</div>
                <div className="text-3xl font-bold text-green-600">{stats.approvedToday}</div>
              </div>
              <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
                <CheckCircle2 className="w-6 h-6 text-green-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium text-gray-600">Rejected Today</div>
                <div className="text-3xl font-bold text-red-600">{stats.rejectedToday}</div>
              </div>
              <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center">
                <XCircle className="w-6 h-6 text-red-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Pending Checks Table */}
      <Card>
        <CardHeader>
          <CardTitle>Pending Parent Identity Verifications</CardTitle>
        </CardHeader>
        <CardContent>
          {parentChecks.length === 0 ? (
            <EmptyState
              icon={ShieldCheck}
              title="No pending verifications"
              description="All parent identity checks have been reviewed"
            />
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User</TableHead>
                    <TableHead>Document Type</TableHead>
                    <TableHead>Selfie Confidence</TableHead>
                    <TableHead>Submitted</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {parentChecks.map((check) => {
                    const statusInfo = getVerificationStatusLabel(check.verification_status);
                    const confidenceColor = getConfidenceColor(check.selfie_confidence);

                    return (
                      <TableRow
                        key={check.id}
                        className="cursor-pointer hover:bg-gray-50"
                        onClick={() => setSelectedCheck(check)}
                      >
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <UserAvatar
                              name={`${check.first_name || ''} ${check.last_name || ''}`.trim() || 'Unknown'}
                              className="h-8 w-8"
                            />
                            <div>
                              <div className="font-medium">
                                {check.first_name} {check.last_name}
                              </div>
                              <div className="text-sm text-gray-500">{check.email}</div>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <FileText className="w-4 h-4 text-gray-400" />
                            <span className="text-sm">
                              {check.document_type === "passport"
                                ? "Passport"
                                : check.document_type === "driver's license"
                                ? "Driver's License"
                                : check.document_type || "—"}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          {check.selfie_confidence !== null ? (
                            <span className={`text-sm font-medium ${confidenceColor}`}>
                              {check.selfie_confidence.toFixed(1)}%
                            </span>
                          ) : (
                            <span className="text-sm text-gray-400">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <span className="text-sm text-gray-600">
                            {formatRelativeTime(check.created_at)}
                          </span>
                        </TableCell>
                        <TableCell>
                          <span
                            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusInfo.color}`}
                          >
                            {statusInfo.label}
                          </span>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Modal */}
      <ParentIDCheckModal
        check={selectedCheck}
        open={!!selectedCheck}
        onOpenChange={(open) => { if (!open) setSelectedCheck(null); }}
      />
    </div>
  );
}
