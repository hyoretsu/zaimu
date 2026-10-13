import { createContext } from "react";

// Portals retain React context, so popups can stay above their owning dialog.
export const PopupLayerContext = createContext(49);
