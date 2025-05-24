document.addEventListener("DOMContentLoaded", () => {
  const fileInput = document.getElementById("fileInput");
  const dropArea = document.getElementById("dropArea");
  const imagePreview = document.getElementById("imagePreview");
  const clearBtn = document.getElementById("clearBtn");
  const convertBtn = document.getElementById("convertBtn");

  let uploadedImages = [];

  // Drag and drop handlers
  dropArea.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropArea.classList.add("dragover");
  });

  dropArea.addEventListener("dragleave", () => {
    dropArea.classList.remove("dragover");
  });

  dropArea.addEventListener("drop", (e) => {
    e.preventDefault();
    dropArea.classList.remove("dragover");
    handleFiles(e.dataTransfer.files);
  });

  // File input handler
  fileInput.addEventListener("change", () => {
    handleFiles(fileInput.files);
  });

  // Process uploaded files
  function handleFiles(files) {
    if (!files || files.length === 0) return;

    for (const file of files) {
      if (!file.type.match("image.*")) {
        alert("Please upload only image files (JPEG, PNG)");
        continue;
      }

      const reader = new FileReader();
      reader.onload = (e) => {
        uploadedImages.push(e.target.result);
        updatePreview();
      };
      reader.onerror = () => {
        alert("Error reading file");
      };
      reader.readAsDataURL(file);
    }
  }

  // Update image preview
  function updatePreview() {
    imagePreview.innerHTML = "";

    uploadedImages.forEach((imgSrc, index) => {
      const imgContainer = document.createElement("div");
      imgContainer.className = "image-container";
      imgContainer.draggable = true;
      imgContainer.dataset.index = index;

      const img = document.createElement("img");
      img.src = imgSrc;

      const removeBtn = document.createElement("button");
      removeBtn.textContent = "×";
      removeBtn.className = "remove-btn";
      removeBtn.onclick = (e) => {
        e.stopPropagation();
        uploadedImages.splice(index, 1);
        updatePreview();
      };

      // Drag event handlers
      imgContainer.addEventListener("dragstart", (e) => {
        e.dataTransfer.setData("text/plain", index);
        imgContainer.classList.add("dragging");
        setTimeout(() => imgContainer.classList.add("invisible"), 0);
      });

      imgContainer.addEventListener("dragend", () => {
        imgContainer.classList.remove("dragging", "invisible");
      });

      imgContainer.addEventListener("dragover", (e) => {
        e.preventDefault();
        const draggingElement = document.querySelector(".dragging");
        if (draggingElement && draggingElement !== imgContainer) {
          const rect = imgContainer.getBoundingClientRect();
          const next = (e.clientY - rect.top) / rect.height > 0.5;
          imagePreview.insertBefore(
            draggingElement,
            next ? imgContainer.nextSibling : imgContainer
          );
        }
      });

      imgContainer.appendChild(img);
      imgContainer.appendChild(removeBtn);
      imagePreview.appendChild(imgContainer);
    });
  }

  // Handle drop to reorder
  imagePreview.addEventListener("drop", (e) => {
    e.preventDefault();
    const fromIndex = parseInt(e.dataTransfer.getData("text/plain"));
    const draggingElement = document.querySelector(".dragging");
    const toIndex = Array.from(imagePreview.children).indexOf(draggingElement);

    if (fromIndex !== toIndex && toIndex >= 0) {
      const [movedItem] = uploadedImages.splice(fromIndex, 1);
      uploadedImages.splice(toIndex, 0, movedItem);
      updatePreview();
    }
  });

  // Clear all images
  clearBtn.addEventListener("click", () => {
    uploadedImages = [];
    imagePreview.innerHTML = "";
    fileInput.value = "";
  });

  // Convert to PDF
  convertBtn.addEventListener("click", async () => {
    const loading = document.getElementById("loading");

    try {
      loading.style.display = "flex";
      void loading.offsetHeight;

      if (uploadedImages.length === 0) {
        alert("Please upload at least one image!");
        return;
      }

      const compressionQuality = parseFloat(
        document.getElementById("compression").value
      );
      const { PDFDocument } = PDFLib;
      const pdfDoc = await PDFDocument.create();

      // Function to compress image before embedding
      const compressImage = async (imgSrc, quality) => {
        return new Promise((resolve) => {
          const img = new Image();
          img.onload = () => {
            const canvas = document.createElement("canvas");
            const ctx = canvas.getContext("2d");

            // Calculate new dimensions
            const width = img.width * quality;
            const height = img.height * quality;

            canvas.width = width;
            canvas.height = height;
            ctx.drawImage(img, 0, 0, width, height);

            // Convert to compressed JPEG
            canvas.toBlob(
              (blob) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result);
                reader.readAsDataURL(blob);
              },
              "image/jpeg",
              quality
            );
          };
          img.src = imgSrc;
        });
      };

      for (const imgSrc of uploadedImages) {
        try {
          // Compress image before embedding
          const compressedImg = await compressImage(imgSrc, compressionQuality);
          const imgBytes = await fetch(compressedImg).then((res) =>
            res.arrayBuffer()
          );

          const image = await pdfDoc.embedJpg(imgBytes); // Now always JPEG
          const page = pdfDoc.addPage([image.width, image.height]);
          page.drawImage(image, {
            x: 0,
            y: 0,
            width: image.width,
            height: image.height,
          });
        } catch (imgError) {
          console.error("Error processing image:", imgError);
          continue;
        }
      }

      const pdfBytes = await pdfDoc.save();
      const blob = new Blob([pdfBytes], { type: "application/pdf" });

      // Generate unique filename
      const timestamp = new Date().getTime();
      const filename = `converted_images_${timestamp}.pdf`;

      if (window.cordova || window.Capacitor) {
        // Mobile app environment
        const reader = new FileReader();
        reader.onloadend = function () {
          const base64data = reader.result.split(",")[1];

          if (window.cordova) {
            // Cordova implementation
            window.resolveLocalFileSystemURL(
              cordova.file.externalDataDirectory,
              function (dir) {
                dir.getFile(filename, { create: true }, function (file) {
                  file.createWriter(
                    function (fileWriter) {
                      fileWriter.write(
                        new Blob([atob(base64data)], {
                          type: "application/pdf",
                        })
                      );
                      alert("PDF saved to your device storage!"); // NEW: User feedback
                    },
                    function (error) {
                      console.error("File write error:", error);
                      alert("Failed to save PDF: " + error.message); // NEW: Error handling
                    }
                  );
                });
              }
            );
          } else if (window.Capacitor && Capacitor.Plugins.Filesystem) {
            // Capacitor implementation
            Filesystem.writeFile({
              path: filename,
              data: base64data,
              directory: Directory.Documents,
              encoding: Encoding.UTF8,
            })
              .then(() => {
                alert("PDF saved to your Documents folder!"); // NEW: User feedback
              })
              .catch((error) => {
                console.error("File write error:", error);
                alert("Failed to save PDF: " + error.message); // NEW: Error handling
              });
          }
        };
        reader.readAsDataURL(blob);
      } else {
        // Standard browser download
        if (typeof saveAs !== "undefined") {
          saveAs(blob, filename);
        } else {
          const link = document.createElement("a");
          link.href = URL.createObjectURL(blob);
          link.download = filename;
          document.body.appendChild(link);
          link.click();
          setTimeout(() => document.body.removeChild(link), 100);
        }
      }
    } catch (error) {
      console.error("PDF generation error:", error);
      alert("Failed to generate PDF: " + error.message);
    } finally {
      setTimeout(() => {
        loading.style.display = "none";
      }, 300);
    }
  });
});
