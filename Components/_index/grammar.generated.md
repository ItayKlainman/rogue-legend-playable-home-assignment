<!-- generated from grammar.json — do not edit by hand -->
## Naming grammar (v1)

**Categories:** Button, Frame, Slider, Title, Label, Popup, UI, Icon

**Size:** Small, Large

**Part:** Background, Border, InnerBorder, Fill, FocusGlow, Line, Gradient, Level

**Color:** Blue, Green, Red, Mint, Navy, White, Yellow, Pink, Orange, Gray, Dark, Brown, Sky, Purple, Gold, Silver, Bronze

**State:** Focus, Locked, Open, Light

**Required slots:** Button=[Part]; Frame=[Part]; Slider=[Part]; Popup=[Part]; Label=[Part]; Title=[]; Icon=[]; UI=[]

**Conformance:** A category with required slots (Button/Frame/Slider/Popup/Label) is strict: every token after the subtype must map to a known slot, else the name is non-conformant. Open categories (empty required slots: Title/Icon/UI) are lenient: they additionally permit free-form descriptive trailing tokens that fit no slot (e.g. Icon_Picto_Book, Icon_Item_Medal_Bronze). This asymmetry is intentional — icon/title art is too open-vocabulary to enumerate.
