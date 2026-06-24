import React, { useState, useEffect, useRef } from 'react';

const PAGE_HEIGHT_PX = 1123; // A4 height in pixels
const PAGE_CONTENT_LIMIT = PAGE_HEIGHT_PX - 120; // Leave room for footer and padding
const PAGE_WIDTH_PX = 794; 

export default function PaginatedViewer({ children }) {
  const [pages, setPages] = useState([]);
  const [isPaginating, setIsPaginating] = useState(true);
  const hiddenContainerRef = useRef(null);

  useEffect(() => {
    if (!hiddenContainerRef.current) return;

    const timer = setTimeout(() => {
      const container = hiddenContainerRef.current;
      
      let topNodes = Array.from(container.childNodes);
      if (topNodes.length === 1 && topNodes[0].nodeType === Node.ELEMENT_NODE) {
        topNodes = Array.from(topNodes[0].childNodes);
      }

      const newPages = [];
      let currentPageHtml = "";
      let currentHeight = 0;
      let wrapperStack = [];

      const pushPage = () => {
        if (currentPageHtml.trim().length > 0) {
          let closedHtml = currentPageHtml;
          for (let i = wrapperStack.length - 1; i >= 0; i--) {
            closedHtml += `</${wrapperStack[i].tagName}>`;
          }
          newPages.push(closedHtml);
        }
        currentPageHtml = "";
        for (let i = 0; i < wrapperStack.length; i++) {
          currentPageHtml += wrapperStack[i].startHtml;
        }
        currentHeight = 0;
      };

      const unbreakableTags = ['table', 'img', 'svg', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'tr', 'td', 'th', 'thead', 'tbody'];

      const processNode = (node) => {
        if (node.nodeType !== Node.ELEMENT_NODE) {
          if (node.textContent && node.textContent.trim().length > 0) {
            currentPageHtml += node.textContent;
          }
          return;
        }

        const el = node;

        const isPageBreak = el.classList?.contains('page-break') || el.style?.pageBreakAfter === 'always';
        if (isPageBreak) {
          pushPage();
          return;
        }

        const nodeHeight = el.offsetHeight || 0;
        const tagName = el.tagName.toLowerCase();
        
        const isUnbreakable = unbreakableTags.includes(tagName) || 
                              el.classList?.contains('ecm-card') || 
                              el.classList?.contains('chart') ||
                              el.classList?.contains('report-table');

        if (currentHeight + nodeHeight <= PAGE_CONTENT_LIMIT || nodeHeight === 0) {
          currentPageHtml += el.outerHTML;
          currentHeight += nodeHeight;
        } else {
          if (isUnbreakable || el.childNodes.length === 0) {
            pushPage();
            currentPageHtml += el.outerHTML;
            currentHeight += nodeHeight;
          } else {
            let attrs = "";
            for (let i = 0; i < el.attributes.length; i++) {
              attrs += ` ${el.attributes[i].name}="${el.attributes[i].value}"`;
            }
            const startHtml = `<${tagName}${attrs}>`;
            
            currentPageHtml += startHtml;
            wrapperStack.push({ tagName, startHtml });
            
            Array.from(el.childNodes).forEach(child => {
              processNode(child);
            });
            
            wrapperStack.pop();
            currentPageHtml += `</${tagName}>`;
          }
        }
      };

      topNodes.forEach(node => {
        if (node.classList?.contains('report-page')) {
          if (currentHeight > 0) pushPage();
          
          let attrs = "";
          for (let i = 0; i < node.attributes.length; i++) {
             // Remove fixed minHeight from internal report-page so it doesn't artificially stretch the sliced chunks
             let val = node.attributes[i].value;
             if (node.attributes[i].name === 'style') {
                val = val.replace(/min-height[^;]+;?/gi, '');
             }
             attrs += ` ${node.attributes[i].name}="${val}"`;
          }
          const tagName = node.tagName.toLowerCase();
          const startHtml = `<${tagName}${attrs}>`;
          
          currentPageHtml += startHtml;
          wrapperStack.push({ tagName, startHtml });
          
          Array.from(node.childNodes).forEach(child => {
            processNode(child);
          });
          
          wrapperStack.pop();
          currentPageHtml += `</${tagName}>`;
          pushPage();
        } else {
          processNode(node);
        }
      });

      pushPage();
      
      setPages(newPages);
      setIsPaginating(false);
    }, 200);

    return () => clearTimeout(timer);
  }, [children]);

  return (
    <div className="paginated-viewer-container">
      {isPaginating && (
        <div 
          ref={hiddenContainerRef} 
          style={{ 
            position: 'absolute', 
            visibility: 'hidden', 
            width: `${PAGE_WIDTH_PX}px`,
            left: '-9999px',
            top: 0
          }}
        >
          {children}
        </div>
      )}

      {!isPaginating && pages.length > 0 && (
        <div className="paginated-pages-wrapper bg-[#F3F4F6] p-4 md:p-8 flex flex-col items-center">
          {pages.map((pageHtml, index) => (
            <div key={index} className="report-page">
              <div 
                className="page-content"
                dangerouslySetInnerHTML={{ __html: pageHtml }}
              />
              <div className="page-footer">
                Page {index + 1} of {pages.length}
              </div>
            </div>
          ))}
        </div>
      )}
      
      {isPaginating && (
        <div className="flex flex-col items-center justify-center h-64 bg-white/5 rounded-xl border border-white/10">
          <div className="w-8 h-8 border-2 border-t-blue-500 border-white/20 rounded-full animate-spin mb-4" />
          <p className="text-sm text-gray-500 font-medium tracking-wide">Paginating report documents...</p>
        </div>
      )}
    </div>
  );
}
