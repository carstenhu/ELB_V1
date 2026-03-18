import type { CaseFile } from "@elb/domain/index";
import {
  addObject,
  applyAuctionPricingRules,
  createSnapshot,
  deleteObject,
  updateCurrentCase,
  updateMasterData,
  updateObject
} from "../../appState";
import { usePlatform } from "../../platform/platformContext";
import { createOptimizedImageAsset } from "../../ui/caseAssets";

export function useCaseEditorActions(caseFile: CaseFile) {
  const platform = usePlatform();

  async function persistWorkspaceSnapshot(): Promise<void> {
    await platform.workspaceRepository.save(createSnapshot());
  }

  async function uploadConsignorPhoto(file: File): Promise<void> {
    const asset = await platform.caseAssets.persistAsset(caseFile, await createOptimizedImageAsset(file));

    updateCurrentCase((current) => ({
      ...current,
      assets: [...current.assets.filter((item) => item.id !== current.consignor.photoAssetId), asset],
      consignor: { ...current.consignor, photoAssetId: asset.id }
    }));

    await persistWorkspaceSnapshot();
  }

  async function removeConsignorPhoto(): Promise<void> {
    updateCurrentCase((current) => ({
      ...current,
      assets: current.assets.filter((asset) => asset.id !== current.consignor.photoAssetId),
      consignor: { ...current.consignor, photoAssetId: "" }
    }));

    await persistWorkspaceSnapshot();
  }

  async function uploadObjectPhotos(objectId: string, files: File[]): Promise<void> {
    const assets = await Promise.all(
      files.map(async (file) => platform.caseAssets.persistAsset(caseFile, await createOptimizedImageAsset(file)))
    );

    updateCurrentCase((current) => ({
      ...current,
      assets: [...current.assets, ...assets],
      objects: current.objects.map((item) =>
        item.id === objectId ? { ...item, photoAssetIds: [...item.photoAssetIds, ...assets.map((asset) => asset.id)] } : item
      )
    }));

    await persistWorkspaceSnapshot();
  }

  async function removeObjectPhoto(objectId: string, assetId: string): Promise<void> {
    updateCurrentCase((current) => ({
      ...current,
      assets: current.assets.filter((item) => item.id !== assetId),
      objects: current.objects.map((item) =>
        item.id === objectId ? { ...item, photoAssetIds: item.photoAssetIds.filter((candidateId) => candidateId !== assetId) } : item
      )
    }));

    await persistWorkspaceSnapshot();
  }

  return {
    addObject,
    applyAuctionPricingRules,
    deleteObject,
    removeConsignorPhoto,
    removeObjectPhoto,
    updateCurrentCase,
    updateMasterData,
    updateObject,
    uploadConsignorPhoto,
    uploadObjectPhotos
  };
}
