import React, { useEffect, useState } from "react";
import { Button, Modal, ColorPicker, message, Typography, theme, Tooltip, Empty } from "antd";
import { PlusOutlined, DeleteOutlined, CheckOutlined } from "@ant-design/icons";
import { presetColorApi } from "../../services/api";
import type { PresetColor } from "../../types";

const { Text } = Typography;

// 单个色块: 圆形 swatch + 色值文本 + 删除 (悬停显示)
const ColorChip: React.FC<{
  preset: PresetColor;
  onDelete: (id: string) => void;
}> = ({ preset, onDelete }) => {
  const { token } = theme.useToken();
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "4px 8px 4px 5px",
        borderRadius: 999,
        border: `1px solid ${token.colorBorderSecondary}`,
        background: token.colorFillQuaternary,
      }}
    >
      <span
        style={{
          width: 18,
          height: 18,
          borderRadius: "50%",
          background: preset.color,
          border: "1px solid rgba(0,0,0,0.12)",
          display: "inline-block",
          flexShrink: 0,
        }}
      />
      <Text style={{ fontSize: 12, fontFamily: "var(--ql-font-family, monospace)" }}>{preset.color}</Text>
      <Tooltip title="删除">
        <Button
          size="small"
          type="text"
          danger
          icon={<DeleteOutlined style={{ fontSize: 11 }} />}
          onClick={() => onDelete(preset._id)}
          style={{ minWidth: 20, width: 20, height: 20, padding: 0 }}
        />
      </Tooltip>
    </div>
  );
};

// 背景色管理弹窗: 维护预设背景色色板, 供添加/编辑链接时快速选用
const ColorManager: React.FC<{
  open: boolean;
  onClose: () => void;
  onChanged: () => void;
}> = ({ open, onClose, onChanged }) => {
  const { token } = theme.useToken();
  const [colors, setColors] = useState<PresetColor[]>([]);
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState(false);
  // 待添加的色值: null = 未选择 (按钮禁用), cleared Color 对象同样视为未选择
  const [pending, setPending] = useState<any>(null);

  const pendingHex =
    pending && !pending.cleared ? (typeof pending === "string" ? pending : pending.toHexString?.()) : null;

  const loadColors = async () => {
    setLoading(true);
    try {
      const res = await presetColorApi.list();
      setColors(res.data || []);
    } catch {
      message.error("加载预设背景色失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      setPending(null);
      loadColors();
    }
  }, [open]);

  const handleAdd = async () => {
    if (!pendingHex) return;
    setAdding(true);
    try {
      await presetColorApi.add(pendingHex);
      message.success("已添加到预设");
      setPending(null);
      await loadColors();
      onChanged();
    } catch (err: any) {
      message.error(err.response?.data?.error || "添加失败");
    } finally {
      setAdding(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await presetColorApi.remove(id);
      message.success("已删除");
      loadColors();
      onChanged();
    } catch (err: any) {
      message.error(err.response?.data?.error || "删除失败");
    }
  };

  return (
    <Modal
      title="背景色管理"
      open={open}
      onCancel={onClose}
      footer={null}
      width={440}
    >
      {/* 添加行: 选色 + 添加按钮 */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <ColorPicker value={pending} onChange={(c) => setPending(c)} format="hex" showText allowClear />
        <Button
          type="primary"
          size="small"
          icon={<PlusOutlined />}
          loading={adding}
          disabled={!pendingHex}
          onClick={handleAdd}
        >
          添加
        </Button>
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: 24 }}>
          <Text type="secondary">加载中...</Text>
        </div>
      ) : colors.length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无预设背景色，选好颜色后点击「添加」" />
      ) : (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {colors.map((c) => (
            <ColorChip key={c._id} preset={c} onDelete={handleDelete} />
          ))}
        </div>
      )}

      <div
        style={{
          marginTop: 16,
          padding: "8px 12px",
          borderRadius: 6,
          background: token.colorFillQuaternary,
          fontSize: 12,
          color: token.colorTextSecondary,
        }}
      >
        <CheckOutlined style={{ marginRight: 6, color: token.colorPrimary }} />
        预设色会出现在「添加/编辑链接」的背景色选择区，并随导出/导入携带
      </div>
    </Modal>
  );
};

export default ColorManager;
