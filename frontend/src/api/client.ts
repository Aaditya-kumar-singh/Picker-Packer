// YBM Picker & Packer — Unified REST API Client
// Direct re-exports and high-level facades over pickerAppApi, packerAppApi, and authApi

export * from "./http";
export * from "./authApi";
export * from "./pickerAppApi";
export * from "./packerAppApi";

import { pickerAppApi } from "./pickerAppApi";
import { packerAppApi } from "./packerAppApi";
import * as authApi from "./authApi";
import type {
  FulfillmentOrderDto,
  FulfillmentOrderItemDto,
  PickerScanResponseDto,
  PackerScanResponseDto,
  PickerStatsDto,
  PackerStatsDto,
  PackerCandidateDto,
  RiderCandidateDto,
  FulfillmentStaffProfileDto,
} from "@/types";

// ==========================================
// UNIFIED PICKER OPERATIONS (/api/picker-app)
// ==========================================

export async function fetchPickerOrders(): Promise<FulfillmentOrderDto[]> {
  return pickerAppApi.getAssignedOrders();
}

export async function fetchPickerStats(): Promise<PickerStatsDto> {
  return pickerAppApi.getStats();
}

export async function fetchPickerOrderItems(orderId: number): Promise<FulfillmentOrderItemDto[]> {
  return pickerAppApi.getOrderItems(orderId);
}

export async function scanPickerItem(orderId: number, barcode: string): Promise<PickerScanResponseDto> {
  return pickerAppApi.scanOrderItem(orderId, barcode);
}

export async function assignPackerToOrder(orderId: number, packerId: number): Promise<string> {
  return pickerAppApi.assignPacker(orderId, packerId);
}

export async function fetchAvailablePackers(): Promise<PackerCandidateDto[]> {
  return pickerAppApi.getAvailablePackers();
}

// ==========================================
// UNIFIED PACKER OPERATIONS (/api/packer-app)
// ==========================================

export async function fetchPackerOrders(): Promise<FulfillmentOrderDto[]> {
  return packerAppApi.getAssignedOrders();
}

export async function fetchPackerOrderDetail(orderId: number): Promise<FulfillmentOrderDto> {
  return packerAppApi.getOrderDetail(orderId);
}

export async function fetchPackerStats(): Promise<PackerStatsDto> {
  return packerAppApi.getStats();
}

export async function scanPackerItem(orderId: number, barcode: string): Promise<PackerScanResponseDto> {
  return packerAppApi.scanOrderItem(orderId, barcode);
}

export async function assignRiderToOrder(
  orderId: number,
  riderId: number,
  notes?: string
): Promise<string> {
  return packerAppApi.assignRider(orderId, { riderId, notes });
}

export async function fetchAvailableRiders(): Promise<RiderCandidateDto[]> {
  return packerAppApi.getAvailableRiders();
}

// Legacy-compatible aliases to ease screen migrations
export const packerOrders = async () => {
  const orders = await packerAppApi.getAssignedOrders();
  return { orders };
};

export const packerOrder = async (orderId: string | number) => {
  const numericId = typeof orderId === "string" ? parseInt(orderId, 10) : orderId;
  return packerAppApi.getOrderDetail(numericId);
};

export const packerStats = async () => {
  return packerAppApi.getStats();
};

export const packerRiders = async () => {
  const riders = await packerAppApi.getAvailableRiders();
  return { riders };
};

export const packerScan = async (orderId: string | number, barcode: string) => {
  const numericId = typeof orderId === "string" ? parseInt(orderId, 10) : orderId;
  return packerAppApi.scanOrderItem(numericId, barcode);
};

export const packerAssignRider = async (orderId: string | number, riderId: string | number, notes?: string) => {
  const numOrderId = typeof orderId === "string" ? parseInt(orderId, 10) : orderId;
  const numRiderId = typeof riderId === "string" ? parseInt(riderId, 10) : riderId;
  return packerAppApi.assignRider(numOrderId, { riderId: numRiderId, notes });
};
