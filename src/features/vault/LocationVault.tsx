import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { MapPin } from 'lucide-react';
import { toast } from 'sonner';
import { FolderSidebar } from '../../components/vault/FolderSidebar';
import { MobileFolderMenu } from '../../components/vault/MobileFolderMenu';
import { decryptData, encryptData } from '../../lib/cryptoPrimitives';
import { logActivity } from '../../lib/activity';
import { getStringContent } from '../../lib/vaultItemContent';
import { useVaultFolders } from '../../hooks/useVaultFolders';
import { useVaultStore } from '../../store/vaultStore';
import { ErrorBoundary } from '../../components/ui/ErrorBoundary';
import { ErrorFallback } from '../../components/ui/ErrorFallback';
import { LocationList } from './components/LocationVault/LocationList';
import { LocationViewer } from './components/LocationVault/LocationViewer';
import { parseCoordinate } from '../../lib/utils';
import type { VaultItem } from '../../lib/storage';
import { sortPinnedFirst } from '../../lib/pinning';

interface LocationPayload {
  latitude: number;
  longitude: number;
  address: string;
  notes: string;
  accuracy?: number;
  altitude?: number | null;
  capturedAt: number;
}

interface FormState {
  title: string;
  latitude: string;
  longitude: string;
  address: string;
  notes: string;
  accuracy: string;
  altitude: string;
}

const EMPTY_FORM: FormState = {
  title: '',
  latitude: '',
  longitude: '',
  address: '',
  notes: '',
  accuracy: '',
  altitude: '',
};

const parseNum = (value: string | number | null | undefined) => {
  if (value === null || value === undefined || value === '') return null;
  const num = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(num) ? num : null;
};

const validCoords = (lat: number | null, lng: number | null) =>
  lat !== null && lng !== null && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;

const payloadToForm = (item: VaultItem | null, payload: LocationPayload | null): FormState => ({
  title: item?.title || '',
  latitude: payload ? String(payload.latitude) : '',
  longitude: payload ? String(payload.longitude) : '',
  address: payload?.address || '',
  notes: payload?.notes || '',
  accuracy: typeof payload?.accuracy === 'number' ? String(payload.accuracy) : '',
  altitude: typeof payload?.altitude === 'number' ? String(payload.altitude) : '',
});

const formToPayload = (form: FormState): LocationPayload | null => {
  const latitude = parseCoordinate(form.latitude);
  const longitude = parseCoordinate(form.longitude);
  if (!validCoords(latitude, longitude)) return null;
  return {
    latitude: latitude!,
    longitude: longitude!,
    address: form.address.trim(),
    notes: form.notes.trim(),
    accuracy: parseNum(form.accuracy) ?? undefined,
    altitude: parseNum(form.altitude),
    capturedAt: Date.now(),
  };
};

const LocationVaultInternal: React.FC = () => {
  const items = useVaultStore((state) => state.items);
  const addItem = useVaultStore((state) => state.addItem);
  const removeItem = useVaultStore((state) => state.removeItem);
  const updateItem = useVaultStore((state) => state.updateItem);
  const togglePin = useVaultStore((state) => state.togglePin);
  const pinningItemIds = useVaultStore((state) => state.pinningItemIds);
  const masterKey = useVaultStore((state) => state.masterKey);
  const locations = useMemo(() => items.filter((item) => item.type === 'location'), [items]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [isMobileFolderOpen, setIsMobileFolderOpen] = useState(false);
  const [payload, setPayload] = useState<LocationPayload | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [copied, setCopied] = useState<'coords' | 'id' | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isFetchingAddress, setIsFetchingAddress] = useState(false);
  const [isFetchingAltitude, setIsFetchingAltitude] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Debounce search query
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const {
    folders,
    currentFolder,
    setCurrentFolder,
    isAddingFolder,
    setIsAddingFolder,
    newFolderName,
    setNewFolderName,
    editingFolder,
    setEditingFolder,
    editingFolderName,
    setEditingFolderName,
    handleCreateFolder,
    handleRenameFolder,
    handleDeleteFolder,
    handleMoveToFolder,
  } = useVaultFolders('location');

  const filteredLocations = useMemo(() => {
    const query = debouncedSearchQuery.trim().toLowerCase();
    return sortPinnedFirst(
      locations.filter((item) => {
        const title = item.title.toLowerCase();
        const id = item.id.toLowerCase();
        const address = String(item.metadata?.address || '').toLowerCase();

        const matchesSearch =
          query.length === 0 ||
          title.includes(query) ||
          id.includes(query) ||
          address.includes(query);

        // If searching, ignore folder restriction to show all global matches
        const matchesFolder =
          query.length > 0 || currentFolder === null || item.folder === currentFolder;

        return matchesSearch && matchesFolder;
      })
    );
  }, [locations, debouncedSearchQuery, currentFolder]);

  const selectedItem = useMemo(
    () => locations.find((item) => item.id === selectedId) ?? null,
    [locations, selectedId]
  );
  const selectedIndex = useMemo(
    () => filteredLocations.findIndex((item) => item.id === selectedId),
    [filteredLocations, selectedId]
  );
  const hasPrevious = selectedIndex > 0;
  const hasNext = selectedIndex >= 0 && selectedIndex < filteredLocations.length - 1;

  const resetEditor = useCallback(() => {
    setForm(EMPTY_FORM);
    setIsCreating(false);
    setIsEditing(false);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    const decryptSelected = async () => {
      if (!selectedItem || !masterKey) {
        if (active) setPayload(null);
        return;
      }

      try {
        const encrypted = getStringContent(selectedItem.content);
        if (!encrypted) throw new Error('Unsupported location data');
        const decrypted = await decryptData(encrypted, masterKey);
        if (!active || controller.signal.aborted) return;

        if (!decrypted) throw new Error('Failed to decrypt location');
        const parsed = JSON.parse(decrypted);

        if (
          !parsed ||
          typeof parsed.latitude !== 'number' ||
          typeof parsed.longitude !== 'number'
        ) {
          throw new Error('Invalid location data format');
        }

        if (!active) return;
        setPayload(parsed as LocationPayload);
        if (!isEditing && !isCreating) {
          setForm(payloadToForm(selectedItem, parsed));
        }
      } catch (error) {
        console.error('Location decrypt failed:', error);
        if (active) {
          setPayload(null);
          toast.error('Failed to open location');
        }
      }
    };

    void decryptSelected();
    return () => {
      active = false;
      controller.abort();
    };
  }, [selectedItem, masterKey, isEditing, isCreating]);

  const fetchAddress = useCallback(async (lat: number, lng: number) => {
    setIsFetchingAddress(true);
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`,
        {
          headers: {
            'Accept-Language': 'en-US,en;q=0.9',
            'User-Agent': 'Vault-Location-Service/1.0',
          },
        }
      );
      if (!response.ok) throw new Error('Network response was not ok');
      const data = await response.json();
      if (data && data.display_name) {
        return data.display_name as string;
      }
      return '';
    } catch (error) {
      console.error('Reverse geocoding failed:', error);
      return '';
    } finally {
      setIsFetchingAddress(false);
    }
  }, []);

  const fetchAltitudeApi = useCallback(async (lat: number, lng: number) => {
    setIsFetchingAltitude(true);
    try {
      const response = await fetch(
        `https://api.open-meteo.com/v1/elevation?latitude=${lat}&longitude=${lng}`
      );
      if (!response.ok) throw new Error('Elevation network error');
      const data = await response.json();
      if (data && Array.isArray(data.elevation) && typeof data.elevation[0] === 'number') {
        return data.elevation[0] as number;
      }
      return null;
    } catch (error) {
      console.error('Elevation API fetch failed:', error);
      return null;
    } finally {
      setIsFetchingAltitude(false);
    }
  }, []);

  const captureCurrentLocation = useCallback(async () => {
    if (!navigator.geolocation) {
      toast.error('Geolocation is not available in this browser');
      return;
    }

    setIsCapturing(true);
    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(
          resolve,
          (err) => {
            if (err.code === 1) toast.error('Permission denied');
            else if (err.code === 2) toast.error('Position unavailable');
            else if (err.code === 3) toast.error('Request timeout');
            reject(err);
          },
          {
            enableHighAccuracy: true,
            timeout: 300000, // 5 minute
            maximumAge: 0,
          }
        );
      });

      let altitudeVal =
        typeof position.coords.altitude === 'number' && position.coords.altitude !== 0
          ? position.coords.altitude.toFixed(2)
          : '';

      setForm((prev) => ({
        ...prev,
        latitude: String(position.coords.latitude),
        longitude: String(position.coords.longitude),
        accuracy: position.coords.accuracy.toFixed(2),
        altitude: altitudeVal || prev.altitude,
        title:
          prev.title ||
          `Location ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`,
      }));

      if (!isCreating && !isEditing) {
        setSelectedId(null);
        setIsCreating(true);
      }

      // Automatically fetch altitude from Open-Meteo Elevation API if browser altitude is unavailable
      if (!altitudeVal) {
        void fetchAltitudeApi(position.coords.latitude, position.coords.longitude).then((alt) => {
          if (alt !== null) {
            setForm((prev) => ({ ...prev, altitude: alt.toFixed(2) }));
          }
        });
      }

      toast.promise(fetchAddress(position.coords.latitude, position.coords.longitude), {
        loading: 'Fetching address for coordinates...',
        success: (addr) => {
          if (addr) {
            setForm((prev) => ({ ...prev, address: addr }));
            return 'Address fetched successfully';
          }
          return 'Coordinates captured, but address unavailable';
        },
        error: 'Failed to fetch address',
      });
    } catch (error) {
      console.error('Location capture failed:', error);
      if (!(error && typeof error === 'object' && 'code' in error)) {
        toast.error('Unable to capture current location');
      }
    } finally {
      setIsCapturing(false);
    }
  }, [fetchAddress, fetchAltitudeApi, isCreating, isEditing]);

  const saveNewLocation = useCallback(async () => {
    if (!masterKey) {
      toast.error('Unlock the vault before saving locations');
      return;
    }

    const nextPayload = formToPayload(form);
    if (!nextPayload) {
      toast.error('Enter valid latitude and longitude values');
      return;
    }

    const title = form.title.trim() || `Location ${new Date().toLocaleDateString()}`;

    setIsSaving(true);
    try {
      const encrypted = await encryptData(JSON.stringify(nextPayload), masterKey);

      const newItem = await addItem({
        type: 'location',
        title,
        content: encrypted,
        folder: currentFolder || undefined,
        metadata: {
          address: nextPayload.address || null,
          latitude: nextPayload.latitude,
          longitude: nextPayload.longitude,
          accuracy: nextPayload.accuracy ?? null,
          altitude: nextPayload.altitude ?? null,
        },
      });

      setSelectedId(newItem.id);
      setPayload(nextPayload);
      toast.success(`Location "${title}" saved`);

      logActivity({
        actionType: 'item_create',
        itemName: title,
        description: 'Location saved',
        status: 'success',
      });

      setIsCreating(false);
    } catch (error) {
      console.error('Location save failed:', error);
      toast.error('Failed to save location');
    } finally {
      setIsSaving(false);
    }
  }, [masterKey, form, addItem, currentFolder]);

  const saveEditedLocation = useCallback(async () => {
    if (!selectedId || !masterKey || !selectedItem) return;
    const nextPayload = formToPayload(form);
    if (!nextPayload) {
      toast.error('Enter valid latitude and longitude values');
      return;
    }
    const title = form.title.trim() || selectedItem.title;

    setIsSaving(true);
    try {
      const encrypted = await encryptData(JSON.stringify(nextPayload), masterKey);
      await updateItem(selectedId, {
        title,
        content: encrypted,
        metadata: {
          address: nextPayload.address || null,
          latitude: nextPayload.latitude,
          longitude: nextPayload.longitude,
          accuracy: nextPayload.accuracy ?? null,
          altitude: nextPayload.altitude ?? null,
        },
      });

      setPayload(nextPayload);
      setForm(payloadToForm({ ...selectedItem, title }, nextPayload));
      setIsEditing(false);
      toast.success(`Location "${title}" updated`);
      logActivity({
        actionType: 'item_update',
        itemName: title,
        description: 'Location updated',
        status: 'success',
      });
    } catch (error) {
      console.error('Location update failed:', error);
      toast.error('Failed to update location');
    } finally {
      setIsSaving(false);
    }
  }, [selectedId, masterKey, selectedItem, form, updateItem]);

  const deleteLocation = useCallback(
    async (id: string, title: string) => {
      if (confirmDeleteId !== id) {
        setConfirmDeleteId(id);
        return;
      }

      try {
        await removeItem(id);
        if (selectedId === id) {
          const index = filteredLocations.findIndex((i) => i.id === id);
          const nextItem = filteredLocations[index + 1] || filteredLocations[index - 1];

          setSelectedId(nextItem?.id || null);
          setPayload(null);
          resetEditor();
        }
        setConfirmDeleteId(null);
        toast.success(`Location "${title}" deleted`);
        logActivity({
          actionType: 'item_delete',
          itemName: title,
          description: 'Location deleted',
          status: 'success',
        });
      } catch (error) {
        console.error('Location delete failed:', error);
        toast.error('Failed to delete location');
      }
    },
    [removeItem, resetEditor, selectedId, confirmDeleteId, filteredLocations]
  );

  const copyValue = useCallback(
    async (type: 'coords' | 'id') => {
      if (!selectedItem) return;
      const value =
        type === 'id'
          ? selectedItem.id
          : payload
            ? `${payload.latitude}, ${payload.longitude}`
            : '';
      if (!value) return;

      try {
        await navigator.clipboard.writeText(value);
        setCopied(type);
        setTimeout(() => setCopied((prev) => (prev === type ? null : prev)), 1500);
        toast.success(type === 'id' ? 'Location ID copied' : 'Coordinates copied');
      } catch (err) {
        console.error('Clipboard copy failed:', err);
        toast.error('Clipboard not supported or permission denied');
      }
    },
    [selectedItem, payload]
  );

  const startCreate = () => {
    setSelectedId(null);
    setPayload(null);
    setForm(EMPTY_FORM);
    setIsEditing(false);
    setIsCreating(true);
  };

  const startEdit = () => {
    if (!selectedItem) return;
    setForm(payloadToForm(selectedItem, payload));
    setIsCreating(false);
    setIsEditing(true);
  };

  const currentCoords = useMemo(() => {
    const lat = payload?.latitude ?? parseNum(form.latitude);
    const lng = payload?.longitude ?? parseNum(form.longitude);
    return validCoords(lat, lng) ? { lat: lat!, lng: lng! } : null;
  }, [payload, form.latitude, form.longitude]);

  return (
    <div className="relative flex h-full gap-6 overflow-hidden p-4 lg:p-4 xl:p-8">
      <FolderSidebar
        items={locations}
        folders={folders}
        currentFolder={currentFolder}
        setCurrentFolder={setCurrentFolder}
        isAddingFolder={isAddingFolder}
        setIsAddingFolder={setIsAddingFolder}
        newFolderName={newFolderName}
        setNewFolderName={setNewFolderName}
        editingFolder={editingFolder}
        setEditingFolder={setEditingFolder}
        editingFolderName={editingFolderName}
        setEditingFolderName={setEditingFolderName}
        handleCreateFolder={handleCreateFolder}
        handleRenameFolder={handleRenameFolder}
        handleDeleteFolder={handleDeleteFolder}
        handleMoveToFolder={handleMoveToFolder}
        title="Location Categories"
        allItemLabel="All Locations"
        allItemIcon={<MapPin className="h-4 w-4" />}
      />

      <MobileFolderMenu
        isOpen={isMobileFolderOpen}
        onClose={() => setIsMobileFolderOpen(false)}
        items={locations}
        folders={folders}
        currentFolder={currentFolder}
        setCurrentFolder={setCurrentFolder}
        isAddingFolder={isAddingFolder}
        setIsAddingFolder={setIsAddingFolder}
        newFolderName={newFolderName}
        setNewFolderName={setNewFolderName}
        handleCreateFolder={handleCreateFolder}
        editingFolder={editingFolder}
        setEditingFolder={setEditingFolder}
        editingFolderName={editingFolderName}
        setEditingFolderName={setEditingFolderName}
        handleRenameFolder={handleRenameFolder}
        handleDeleteFolder={handleDeleteFolder}
        title="Location Categories"
        allItemLabel="All Locations"
        allItemIcon={<MapPin className="h-4 w-4" />}
      />

      <LocationList
        locations={locations}
        filteredLocations={filteredLocations}
        selectedId={selectedId}
        setSelectedId={setSelectedId}
        isCreating={isCreating}
        setIsCreating={setIsCreating}
        setIsEditing={setIsEditing}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        currentFolder={currentFolder}
        startCreate={startCreate}
        captureCurrentLocation={captureCurrentLocation}
        isCapturing={isCapturing}
        setIsMobileFolderOpen={setIsMobileFolderOpen}
        onTogglePin={(id) => void togglePin(id)}
        pinningItemIds={pinningItemIds}
      />

      <LocationViewer
        selectedId={selectedId}
        selectedItem={selectedItem}
        payload={payload}
        isCreating={isCreating}
        isEditing={isEditing}
        setIsEditing={setIsEditing}
        setSelectedId={setSelectedId}
        form={form}
        setForm={setForm}
        saveNewLocation={saveNewLocation}
        saveEditedLocation={saveEditedLocation}
        resetEditor={resetEditor}
        captureCurrentLocation={captureCurrentLocation}
        isCapturing={isCapturing}
        isSaving={isSaving}
        hasPrevious={hasPrevious}
        hasNext={hasNext}
        goToPrevious={() => {
          if (hasPrevious) setSelectedId(filteredLocations[selectedIndex - 1].id);
        }}
        goToNext={() => {
          if (hasNext) setSelectedId(filteredLocations[selectedIndex + 1].id);
        }}
        copyValue={copyValue}
        copied={copied}
        deleteLocation={deleteLocation}
        confirmDeleteId={confirmDeleteId}
        setConfirmDeleteId={setConfirmDeleteId}
        startEdit={startEdit}
        currentCoords={currentCoords}
        isFetchingAddress={isFetchingAddress}
        isFetchingAltitude={isFetchingAltitude}
        fetchAddress={async () => {
          const lat = parseCoordinate(form.latitude);
          const lng = parseCoordinate(form.longitude);
          if (validCoords(lat, lng)) {
            const addrPromise = fetchAddress(lat!, lng!);
            const altPromise = !form.altitude ? fetchAltitudeApi(lat!, lng!) : Promise.resolve(null);

            const [addr, alt] = await Promise.all([addrPromise, altPromise]);

            if (addr || alt !== null) {
              setForm((p) => ({
                ...p,
                ...(addr ? { address: addr } : {}),
                ...(alt !== null ? { altitude: alt.toFixed(2) } : {}),
              }));
              toast.success('Address and coordinates data updated');
            } else {
              toast.error('Could not find address for these coordinates');
            }
          } else {
            toast.error('Enter valid coordinates first');
          }
        }}
        fetchAltitude={async () => {
          const lat = parseCoordinate(form.latitude);
          const lng = parseCoordinate(form.longitude);
          if (validCoords(lat, lng)) {
            const alt = await fetchAltitudeApi(lat!, lng!);
            if (alt !== null) {
              setForm((p) => ({ ...p, altitude: alt.toFixed(2) }));
              toast.success(`Altitude fetched: ${alt.toFixed(2)}m`);
            } else {
              toast.error('Could not fetch altitude for these coordinates');
            }
          } else {
            toast.error('Enter valid coordinates first');
          }
        }}
      />
    </div>
  );
};

export const LocationVault: React.FC = () => (
  <ErrorBoundary
    fallback={<ErrorFallback label="The location vault encountered an unexpected error." />}
  >
    <LocationVaultInternal />
  </ErrorBoundary>
);
