import { Box, Main } from '@strapi/design-system';
import { useNotification } from '@strapi/strapi/admin';
import { useCallback, useState } from 'react';
import { texturesApi } from '../../api/texturesApi';
import { usePaginatedList } from '../../hooks/usePaginatedList';
import { useTranslate } from '../../hooks/useTranslate';
import type { PlayerCape, PlayerSkin } from '../../types/entities';
import AssetTab from './AssetTab';
import PageHeader from './PageHeader';
import TabNav from './TabNav';
import UploadModal from './UploadModal';

const PAGE_SIZE = 100;
const H_PAD = '56px';

const getServerUrl = (): string => {
  try {
    const config = (window as unknown as { strapi?: { backendURL?: string } }).strapi;
    return config?.backendURL ?? window.location.origin;
  } catch {
    return window.location.origin;
  }
};

const TexturesPage = () => {
  const translate = useTranslate();
  const { toggleNotification } = useNotification();
  const [activeTab, setActiveTab] = useState<'skins' | 'capes'>('skins');
  const [showUpload, setShowUpload] = useState(false);
  const [missingIds, setMissingIds] = useState<{
    skins: Set<number>;
    capes: Set<number>;
  } | null>(null);
  const [validating, setValidating] = useState(false);
  const [purging, setPurging] = useState(false);
  const serverUrl = getServerUrl();

  const fetchSkins = useCallback(
    (search: string, page: number) => texturesApi.listSkins({ page, pageSize: PAGE_SIZE, search }),
    [],
  );
  const fetchCapes = useCallback(
    (search: string, page: number) => texturesApi.listCapes({ page, pageSize: PAGE_SIZE, search }),
    [],
  );

  const handleSkinsError = useCallback(
    () =>
      toggleNotification({
        type: 'warning',
        message: translate('load.toast.failed.skins'),
      }),
    [toggleNotification, translate],
  );
  const handleCapesError = useCallback(
    () =>
      toggleNotification({
        type: 'warning',
        message: translate('load.toast.failed.capes'),
      }),
    [toggleNotification, translate],
  );

  const [skinsState, skinsActions] = usePaginatedList<PlayerSkin>(fetchSkins, handleSkinsError);
  const [capesState, capesActions] = usePaginatedList<PlayerCape>(fetchCapes, handleCapesError);

  const handleValidate = useCallback(async () => {
    setValidating(true);
    try {
      const result = await texturesApi.validate();
      const ids = { skins: new Set(result.missingSkins), capes: new Set(result.missingCapes) };
      setMissingIds(ids);
      const total = result.missingSkins.length + result.missingCapes.length;
      toggleNotification({
        type: total > 0 ? 'warning' : 'success',
        message:
          total > 0
            ? translate('validate.toast.missing', { count: total })
            : translate('validate.toast.ok'),
      });
    } catch {
      toggleNotification({ type: 'warning', message: translate('validate.toast.failed') });
    } finally {
      setValidating(false);
    }
  }, [toggleNotification, translate]);

  const handlePurgeMissing = useCallback(async () => {
    setPurging(true);
    try {
      const result = await texturesApi.purgeMissing();
      setMissingIds(null);
      skinsActions.refresh();
      capesActions.refresh();
      toggleNotification({
        type: 'success',
        message: translate('purge.toast.success', {
          deletedSkins: result.deletedSkins,
          deletedCapes: result.deletedCapes,
        }),
      });
    } catch {
      toggleNotification({ type: 'warning', message: translate('purge.toast.failed') });
    } finally {
      setPurging(false);
    }
  }, [toggleNotification, translate, skinsActions, capesActions]);

  const handleRefresh = useCallback(() => {
    setMissingIds(null);
    skinsActions.refresh();
    capesActions.refresh();
  }, [skinsActions, capesActions]);

  const missingCount = (missingIds?.skins.size ?? 0) + (missingIds?.capes.size ?? 0);

  return (
    <Main>
      <Box style={{ padding: `40px ${H_PAD} 32px` }}>
        <PageHeader
          skinsTotal={skinsState.total}
          capesTotal={capesState.total}
          missingCount={missingCount}
          validating={validating}
          purging={purging}
          onValidate={handleValidate}
          onPurgeMissing={handlePurgeMissing}
          onRefresh={handleRefresh}
          onUpload={() => setShowUpload(true)}
        />
      </Box>

      <Box style={{ padding: `0 ${H_PAD}` }}>
        <TabNav active={activeTab} onChange={setActiveTab} />
      </Box>

      {activeTab === 'skins' && (
        <AssetTab
          kind="skin"
          items={skinsState.items}
          total={skinsState.total}
          page={skinsState.page}
          pageCount={skinsState.pageCount}
          loading={skinsState.loading}
          search={skinsState.search}
          serverUrl={serverUrl}
          missingIds={missingIds?.skins}
          onSearchChange={skinsActions.setSearch}
          onSearchClear={skinsActions.clearSearch}
          onSearchSubmit={skinsActions.submitSearch}
          onPageChange={skinsActions.changePage}
          onDeleted={skinsActions.refresh}
          onDelete={(id) => texturesApi.deleteSkin(id).then(() => {})}
        />
      )}

      {activeTab === 'capes' && (
        <AssetTab
          kind="cape"
          items={capesState.items}
          total={capesState.total}
          page={capesState.page}
          pageCount={capesState.pageCount}
          loading={capesState.loading}
          search={capesState.search}
          serverUrl={serverUrl}
          missingIds={missingIds?.capes}
          onSearchChange={capesActions.setSearch}
          onSearchClear={capesActions.clearSearch}
          onSearchSubmit={capesActions.submitSearch}
          onPageChange={capesActions.changePage}
          onDeleted={capesActions.refresh}
          onDelete={(id) => texturesApi.deleteCape(id).then(() => {})}
        />
      )}

      {showUpload && (
        <UploadModal
          onSkinUploaded={skinsActions.refresh}
          onCapeUploaded={capesActions.refresh}
          onClose={() => setShowUpload(false)}
        />
      )}
    </Main>
  );
};

export default TexturesPage;
